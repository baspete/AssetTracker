/* eslint-disable no-console */
/* global require console process Promise module Vue */

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
        });
        getTrips(this.assets[0]).then(trips => {
          this.trips = trips;
        });
      });
  }
});
