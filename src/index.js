/* eslint-disable no-console */
/* global require console process Promise module Vue MAPBOX_ACCESS_TOKEN */
const mapboxgl = require('mapbox-gl/dist/mapbox-gl.js');
const moment = require('moment');
const geolib = require('geolib');

mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

function getAssets() {
  return new Promise((resolve, reject) => {
    fetch('/api/assets')
      .then(results => results.json())
      .then(assets => {
        resolve(assets);
      })
      .catch(error => {
        reject(error);
      });
  });
}

function getTrips(id) {
  return new Promise((resolve, reject) => {
    fetch(`/api/assets/${id}/trips?since=2019-02-01Z`)
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

function getLastFix(fixes) {
  fixes.items = [fixes.items[fixes.items.length - 1]];
  fixes.count = fixes.items.count;
  fixes.bounds = {
    maxLat: fixes.items[0].latitude,
    minLat: fixes.items[0].latitude,
    maxLng: fixes.items[0].longitude,
    minLng: fixes.items[0].longitude
  };
  return fixes;
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

new Vue({
  el: '#app',
  data: {
    assets: [],
    asset: null,
    lastFix: {},
    trips: []
  },
  mounted() {
    getAssets()
      .then(assets => {
        this.assets = assets;
        this.asset = assets[0];
      })
      .then(() => {
        // Get current location
        getFixes(
          this.assets[0],
          moment()
            .subtract(19, 'minutes')
            .toISOString()
        )
          .then(fixes => {
            this.lastFix = getLastFix(fixes);
            createMap('current-location', 'location', this.lastFix);
          })
          .catch(error => {
            console.log(error);
          });

        // Get Trips
        getTrips(this.assets[0]).then(trips => {
          this.trips = trips;
          getFixes(this.assets[0], trips[0].start, trips[0].end)
            .then(fixes => {
              createMap('trip', 'trip', fixes);
            })
            .catch(error => {
              console.log(error);
            });
        });
      });
  }
});
