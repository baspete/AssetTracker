import Vue from 'vue';
import axios from 'axios';

// Figure out where our Node.js server is. In development it's on 9000; in prod it's on 80.
Vue.prototype.$server =
  process.env.NODE_ENV === 'production'
    ? 'http://localhost'
    : 'http://localhost:9000';

Vue.component('compass-heading', {
  props: ['heading'],
  computed: {
    headingStr: function() {
      let str = '---';
      if (this.heading && typeof this.heading === 'number') {
        str = Math.round(this.heading).toString();
        for (let i = str.length; i < 3; i++) {
          str = '0' + str;
        }
      }
      return str;
    }
  },
  template: '<span>{{headingStr}}</span>'
});

Vue.component('altitude-display', {
  props: ['alt', 'rate'],
  computed: {
    trendSymbol: function() {
      let s = '-';
      if (this.rate && Math.abs(this.rate) > 100) {
        s = this.rate > 0 ? '↑' : '↓';
      }
      return s;
    }
  },
  template: '<span>{{alt.toLocaleString()}} {{trendSymbol}}</span>'
});

// new Vue({
//   created() {
//     console.log('PiAware server is at', this.$server);
//   },
//   el: '#aircraft',
//   data: {
//     aircraft: null
//   },
//   formatCompass(heading) {
//     let headingStr = Math.round(heading).toString();
//     for (let i = headingStr.length; i < 3; i++) {
//       headingStr = '0' + headingStr;
//     }
//     console.log(heading, headingStr);
//     return headingStr;
//   },
//   mounted() {
//     axios.get(`${this.$server}/api/aircraft`).then(response => {
//       this.aircraft = response.data;
//     });
//   }
// });
