// Minimal Reanimated 4 stand-in for Jest: animations resolve instantly, layout animations are no-ops.
const React = require('react');
const RN = require('react-native');

const passthrough = (v) => v;
const chain = new Proxy(function () {}, {
  get: (_t, key) => (key === 'build' ? () => () => ({}) : chain),
  apply: () => chain,
});

function createAnimatedComponent(Component) {
  return React.forwardRef(function AnimatedComponent({ entering, exiting, layout, ...props }, ref) {
    return React.createElement(Component, { ...props, ref });
  });
}

const Animated = {
  View: createAnimatedComponent(RN.View),
  Text: createAnimatedComponent(RN.Text),
  ScrollView: createAnimatedComponent(RN.ScrollView),
  Image: createAnimatedComponent(RN.Image),
  FlatList: createAnimatedComponent(RN.FlatList),
  createAnimatedComponent,
};

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  useSharedValue: (init) => {
    const ref = React.useRef(null);
    if (!ref.current) {
      const sv = { value: init, get: () => sv.value, set: (v) => (sv.value = typeof v === 'function' ? v(sv.value) : v) };
      ref.current = sv;
    }
    return ref.current;
  },
  useAnimatedStyle: (fn) => fn(),
  useDerivedValue: (fn) => ({ value: fn() }),
  useAnimatedProps: (fn) => fn(),
  useAnimatedScrollHandler: () => () => {},
  withSpring: passthrough,
  withTiming: passthrough,
  withDelay: (_d, v) => v,
  withSequence: (...vals) => vals[vals.length - 1],
  withRepeat: passthrough,
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  interpolate: (v) => v,
  Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  Easing: new Proxy({}, { get: () => passthrough }),
  FadeIn: chain,
  FadeOut: chain,
  FadeInDown: chain,
  FadeInUp: chain,
  FadeOutDown: chain,
  FadeOutUp: chain,
  ZoomIn: chain,
  ZoomOut: chain,
  SlideInRight: chain,
  SlideOutLeft: chain,
  LinearTransition: chain,
  Layout: chain,
};
