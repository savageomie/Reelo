// Lucide ships ESM-only (.mjs) bundles that Jest can't load; icons don't matter for behaviour tests.
const React = require('react');
const { View } = require('react-native');

module.exports = new Proxy(
  {},
  {
    get: (_t, name) => {
      if (name === '__esModule') return false;
      return function Icon(props) {
        return React.createElement(View, { testID: 'icon-' + String(name), accessibilityLabel: props && props.accessibilityLabel });
      };
    },
  },
);
