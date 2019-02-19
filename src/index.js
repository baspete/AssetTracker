/* eslint-disable no-console */
/* global require console process Promise module Vue MAPBOX_ACCESS_TOKEN */
const mapboxgl = require('mapbox-gl/dist/mapbox-gl.js');
const moment = require('moment');
const geolib = require('geolib');

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

function createMap(id, type, fixes) {
  // Initialize the map
  let map = new mapboxgl.Map({
    container: id,
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
      createMap('map', 'trip', fixes);
    })
    .catch(error => {
      console.log(error);
    });
}

new Vue({
  el: '#app',
  data: {
    assets: [],
    asset: null,
    latest: {},
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
        this.asset = assets[0];
      })
      .then(() => {
        // Get current location
        getAssets(this.assets[0])
          .then(asset => {
            this.latest = asset.latest.items[0];
            createMap('map', 'location', asset.latest);
          })
          .catch(error => {
            console.log(error);
          });

        // Get Trips
        getTrips(this.assets[0]).then(trips => {
          this.trips = trips;
        });
      });
  }
});
