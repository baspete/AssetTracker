/* eslint-disable no-console */
/* global require console process Promise module Vue MAPBOX_ACCESS_TOKEN */
const mapboxgl = require('mapbox-gl/dist/mapbox-gl.js');
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

function getCurrentLocation(id) {
  return new Promise((resolve, reject) => {
    fetch(`/api/assets/${id}`)
      .then(results => results.json())
      .then(results => {
        resolve(results.last);
      })
      .catch(error => {
        reject(error);
      });
  });
}

function getTrips(id, since, before) {
  return new Promise((resolve, reject) => {
    fetch(`/api/assets/${id}/trips`)
      .then(results => results.json())
      .then(results => {
        resolve(results);
      })
      .catch(error => {
        reject(error);
      });
  });
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
        getCurrentLocation(this.assets[0]).then(lastFix => {
          this.lastFix = location;

          // Initialize the map
          let map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/light-v10',
            center: [lastFix.longitude, lastFix.latitude],
            zoom: 15
          });

          // Marker for asset
          let marker = {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [lastFix.longitude, lastFix.latitude]
            },
            properties: {
              title: lastFix.timestamp,
              description: `Speed: ${lastFix.speed}`
            }
          };

          // create a HTML element for each feature
          let el = document.createElement('div');
          el.className = 'marker';

          // make a marker for each feature and add to the map
          new mapboxgl.Marker(el)
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
        });
        getTrips(this.assets[0]).then(trips => {
          this.trips = trips;
        });
      });
  }
});
