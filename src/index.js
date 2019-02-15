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
  return fixes;
}

function boundingBox(bounds) {
  let e = bounds.maxLng + (bounds.maxLng - bounds.minLng) * 0.25;
  let w = bounds.minLng - (bounds.maxLng - bounds.minLng) * 0.25;
  let n = bounds.maxLat + (bounds.maxLat - bounds.minLat) * 0.25;
  let s = bounds.minLat - (bounds.maxLat - bounds.minLat) * 0.25;
  // if (n === s && w === e) {
  //   console.log('single point', n, s, e, w);
  //   e = e + 0.02;
  //   w = w - 0.02;
  // }
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
  // Iterate over the fixes and add markers
  for (let i = 0; i < fixes.items.length; i++) {
    // Marker for point
    let marker = {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [fixes.items[i].longitude, fixes.items[i].latitude]
      },
      properties: {
        title: fixes.items[i].timestamp,
        description: `Speed: ${fixes.items[i].speed}`
      }
    };

    // create a HTML element for each feature
    let el = document.createElement('div');
    switch (i) {
    case 0:
      el.className = type === 'trip' ? 'start' : 'location';
      break;
    case fixes.length:
      el.className = 'finish';
      break;
    default:
      el.className = 'location';
    }

    // make a marker for each feature and add to the map
    new mapboxgl.Marker(el, {
      offset: [0, -15]
    })
      .setLngLat(marker.geometry.coordinates)
      .setPopup(
        new mapboxgl.Popup({ offset: 25 }).setHTML(
          '<p>' +
            marker.properties.title +
            '</p><p>' +
            marker.properties.description +
            '</p>'
        )
      )
      .addTo(map);
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
