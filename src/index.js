/* eslint-disable no-console */
/* global require console process Promise module Vue */
const mapboxgl = require('mapbox-gl/dist/mapbox-gl.js');

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
    location: {},
    trips: []
  },
  mounted() {
    getAssets()
      .then(assets => {
        this.assets = assets;
        this.asset = assets[0];
      })
      .then(() => {
        getCurrentLocation(this.assets[0]).then(location => {
          this.location = location;
          mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
          var map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/pbutler/cjrzmzx6d00x21fmmeoez0wll',
            center: [location.longitude, location.latitude],
            zoom: 15
          });
        });
        getTrips(this.assets[0]).then(trips => {
          this.trips = trips;
        });
      });
  }
});
