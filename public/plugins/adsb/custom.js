/* global sf */
sf.display.ImageDrum = function() {
  return [
    ' ',
    'SWA',
    'AAL',
    'BAW',
    'DAL',
    'UAE',
    'KLM',
    'DLH',
    'ASA',
    'UAL',
    'FDX',
    'PCM',
    'SKW',
    'JBU',
    'ACA',
    'QXE',
    'NKS',
    'VIR',
    'LXJ',
    'QFA'
  ];
};

sf.plugins.adsb = {
  dataType: 'json',

  url: options => {
    return `/api/aircraft?n=${options.maxResults || options.numRows}`;
  },

  getAltitudeString: (alt, change) => {
    if (alt > 0) {
      let c = ' ';
      if (Math.abs(change) > 100 && alt > 0) {
        if (change > 0) {
          c = '↑';
        } else if (change < 0) {
          c = '↓';
        }
      }
      return `${alt.toString().padStart(5, ' ')}${c}`;
    } else {
      return '    0 ';
    }
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
      )}${aircraft['cardinal-bearing']}`;

      aircraft['altitude-str'] = sf.plugins.adsb.getAltitudeString(
        aircraft['alt_geom'],
        aircraft['baro_rate'] || aircraft['geom_rate']
      );

      aircraft['airspeed-str'] = aircraft.gs
        ? aircraft.gs
          .toFixed(0)
          .toString()
          .padStart(3, ' ')
        : '';
    }
    return response;
  }
};
