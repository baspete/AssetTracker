import Vue from 'vue';
import App from './App.vue';
import axios from 'axios';

// Figure out where our Node.js server is. In development it's on 9000; in prod it's on 80.
Vue.prototype.$server =
  process.env.NODE_ENV === 'production'
    ? 'http://localhost'
    : 'http://localhost:9000';

new Vue({
  el: '#app',
  render: h => h(App),
  created() {
    console.log('PiAware server is at', this.$server);
  },
  mounted() {
    axios.get(`${this.$server}/api/aircraft`).then(response => {
      this.aircraft = response.data;
    });
  }
});
