/* global sf */
sf.display.ImageDrum = function() {
  return [
    ' ',
    'AFL',
    'AAL',
    'BAW',
    'DAL',
    'UAE',
    'KLM',
    'DLH',
    'RYR',
    'UAL',
    'AWE'
  ];
};

sf.plugins.adsb = {
  dataType: 'json',

  url: options => {
    const server = 'http://localhost:9000'; // TODO: fix this
    return `${server}/api/aircraft?n=${options.maxResults || options.numRows}`;
  },

  getAltitudeString: (alt, change) => {
    let c = ' ';
    if (Math.abs(change) > 100 && alt > 0) {
      if (change > 0) {
        c = '↑';
      } else if (change < 0) {
        c = '↓';
      }
    }
    return `${alt.toString().padStart(5, ' ')}${c}`;
  },

  getDistanceString: distance => {
    return (distance.toFixed(1) * 10)
      .toString()
      .padStart(2, '0')
      .padStart(3, ' ');
  },

  formatData: response => {
    for (let i = 0; i < response.length; i++) {
      let aircraft = response[i];

      if (!aircraft['airline']) {
        aircraft['airline'] = ' ';
      }

      aircraft['location-str'] = `${sf.plugins.adsb.getDistanceString(
        aircraft['distance']
      )}${aircraft['compass']}`;

      aircraft['altitude-str'] = sf.plugins.adsb.getAltitudeString(
        aircraft['alt_geom'],
        aircraft['baro_rate']
      );

      aircraft['airspeed-str'] = aircraft.gs
        .toFixed(0)
        .toString()
        .padStart(3, ' ');
    }
    return response;
  }
};
