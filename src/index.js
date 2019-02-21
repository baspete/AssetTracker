/* eslint-disable no-console */
/* global require console process Promise module Vue MAPBOX_ACCESS_TOKEN */
const mapboxgl = require('mapbox-gl/dist/mapbox-gl.js'),
  moment = require('moment'),
  c3 = require('c3');

mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

function getAssets(id = null) {
  let url = '/api/assets';
  if (id) {
    url += `/${id}`;
  }
  return new Promise((resolve, reject) => {
    fetch(url)
      .then(results => results.json())
      .then(assets => {
        resolve(assets);
      })
      .catch(error => {
        reject(error);
      });
  });
}

function getTrips(
  id,
  since = moment()
    .subtract(1, 'month')
    .format()
) {
  return new Promise((resolve, reject) => {
    fetch(`/api/assets/${id}/trips?since=${since}`)
      .then(results => results.json())
      .then(results => {
        resolve(results);
      })
      .catch(error => {
        reject(error);
      });
  });
}

/**
 *
 * @param {string} id Asset GUID
 * @param {string} since ISO8601 String
 * @param {string} before ISO8601 String
 * @returns {object}
 */
function getFixes(id, since, before) {
  return new Promise((resolve, reject) => {
    if (id) {
      let url = `/api/assets/${id}/fixes?`;
      if (since && before) {
        url += `since=${since}&before=${before}`;
      } else {
        if (since) {
          url += `since=${since}`;
        }
        if (before) {
          url += `before=${before}`;
        }
      }
      fetch(url)
        .then(results => results.json())
        .then(fixes => {
          resolve(fixes);
        })
        .catch(error => {
          reject(error);
        });
    } else {
      reject('getFixes(): Missing ID');
    }
  });
}

function boundingBox(bounds, overhang = 0.25) {
  let e = bounds.maxLng + (bounds.maxLng - bounds.minLng) * overhang;
  let w = bounds.minLng - (bounds.maxLng - bounds.minLng) * overhang;
  let n = bounds.maxLat + (bounds.maxLat - bounds.minLat) * overhang;
  let s = bounds.minLat - (bounds.maxLat - bounds.minLat) * overhang;
  return [w, s, e, n];
}

function renderMap(type, fixes) {
  // Initialize the map
  let map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/light-v10',
    bounds: boundingBox(fixes.bounds)
  });
  if (fixes.items.length === 1) {
    map.setZoom(13);
  }

  // This object will hold our route. We'll add it once the map has loaded
  let route = [];

  // Iterate over the fixes and add markers
  for (let i = 0; i < fixes.items.length; i++) {
    let fix = fixes.items[i];

    // Markers for the first and last points
    if (i === 0 || i === fixes.items.length - 1) {
      new mapboxgl.Marker({
        color: i === fixes.items.length - 1 ? 'blue' : 'green'
      })
        .setLngLat([fix.longitude, fix.latitude])
        .addTo(map);
    }
    // // Add this point to our route
    route.push([fix.longitude, fix.latitude]);
  }

  // Add the route to the map
  if (type === 'trip') {
    map.on('load', () => {
      map.addLayer({
        id: 'route',
        type: 'line',
        source: {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: route
            }
          }
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#888',
          'line-width': 2
        }
      });
    });
  }
  return map;
}

function c2f(t) {
  return (t * 9) / 5 + 32;
}

function formatTimestamp(t, format) {
  return moment(t).format(format);
}

function formatTimeRange(start, end) {
  const t = moment.duration(moment(end).diff(moment(start)));
  return t.humanize();
}

function selectTrip(asset, trip) {
  getFixes(asset, trip.start, trip.end)
    .then(fixes => {
      renderMap('trip', fixes);
    })
    .catch(error => {
      console.log(error);
    });
}

function generateChart(el, keys, data) {
  const start = moment(data[0].timestamp);
  const end = moment(data[data.length - 1].timestamp);
  const days = Math.round(moment.duration(end.diff(start)).asDays());
  let labels = [];
  for (let i = days - 1; i >= 0; i--) {
    labels.push(
      moment()
        .startOf('day')
        .subtract(i, 'days')
        .local()
    );
  }
  return c3.generate({
    bindto: el,
    data: {
      json: data,
      keys: {
        value: keys,
        x: 'timestamp',
        xFormat: '%Y-%m-%dT%H:%M:%S.%LZ'
      },
      xFormat: '%Y-%m-%dT%H:%M:%S.%LZ'
    },
    point: {
      show: false
    },
    grid: {
      y: {
        show: true
      }
    },
    axis: {
      x: {
        type: 'timeseries',
        tick: {
          values: labels,
          format: T => {
            return moment(T).format('M/D');
          }
        }
      }
    },
    tooltip: {
      format: {
        title: t => {
          return moment(t).format('M/D h:mmA');
        },
        value: (value, ratio, id) => {
          return value;
        }
      }
    }
  });
}

function renderSystemsData(data) {
  // Extract and transform data for rendering
  const chartData = data.items.map(fix => {
    return {
      timestamp: moment(fix.timestamp).local(),
      temp1: c2f(fix.temp1),
      v1: fix.v1
    };
  });
  let tempChart = generateChart('#temp', ['temp1'], chartData);
  let voltageChart = generateChart('#voltage', ['v1'], chartData);
}

new Vue({
  el: '#app',
  data: {
    assets: [],
    asset: null,
    latest: {},
    fixes: {},
    trips: [],
    c2f,
    formatTimestamp,
    formatTimeRange,
    selectTrip
  },
  mounted() {
    getAssets()
      .then(assets => {
        this.assets = assets;
        this.asset = assets[0]; // TODO: selector?
      })
      .then(() => {
        // Get current location
        getAssets(this.asset)
          .then(asset => {
            this.latest = asset.latest.items[0];
            let map = renderMap('location', asset.latest);
          })
          .catch(error => {
            console.log(error);
          });

        // Get systems history
        getFixes(
          this.asset,
          moment()
            .subtract(2, 'weeks')
            .toISOString(),
          null
        )
          .then(response => {
            this.fixes = response;
          })
          .then(() => {
            renderSystemsData(this.fixes);
          });

        // Get Trips
        getTrips(this.asset).then(trips => {
          this.trips = trips;
        });
      });
  }
});
