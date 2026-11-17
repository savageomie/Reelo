import { fireEvent, render, screen } from '@testing-library/react-native';

import { LogForm } from '@/components/LogForm';
import { RatingStars } from '@/components/RatingStars';
import { ReviewCard } from '@/components/ReviewCard';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

const press = (el: ReturnType<typeof screen.getByTestId>, pageX: number) =>
  fireEvent(el, 'responderGrant', { nativeEvent: { pageX, pageY: 0, locationX: pageX } });

describe('RatingStars', () => {
  it('renders half stars for read-only values', async () => {
    await render(<RatingStars value={3.5} />);
    expect(screen.getByTestId('star-3-full')).toBeTruthy();
    expect(screen.getByTestId('star-4-half')).toBeTruthy();
    expect(screen.getByTestId('star-5-empty')).toBeTruthy();
    expect(screen.getByLabelText('3.5 out of 5 stars')).toBeTruthy();
  });

  it('maps a tap position to a half-star rating', async () => {
    const onChange = jest.fn();
    await render(<RatingStars value={null} onChange={onChange} size={36} testID="stars" />);
    // 5 cells x 40px = 200px wide; x = 130 -> 3.25 stars -> rounds up to 3.5
    await press(screen.getByTestId('stars'), 130);
    expect(onChange).toHaveBeenLastCalledWith(3.5);
  });

  it('tapping the current value clears it', async () => {
    const onChange = jest.fn();
    await render(<RatingStars value={4} onChange={onChange} size={36} testID="stars" />);
    await press(screen.getByTestId('stars'), 160); // exactly 4 stars
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('supports accessibility increment/decrement', async () => {
    const onChange = jest.fn();
    await render(<RatingStars value={2} onChange={onChange} testID="stars" />);
    await fireEvent(screen.getByTestId('stars'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(2.5);
  });
});

describe('ReviewCard', () => {
  const base = {
    entryId: 'e1',
    username: 'asha',
    rating: 4.5,
    review: 'The ending broke me.',
    watchedOn: '2026-11-01',
  };

  it('shows the review text', async () => {
    await render(<ReviewCard {...base} />);
    expect(screen.getByTestId('review-text').props.children).toBe('The ending broke me.');
    expect(screen.getByText('asha')).toBeTruthy();
  });

  it('hides spoilers until tapped', async () => {
    await render(<ReviewCard {...base} spoiler />);
    expect(screen.queryByTestId('review-text')).toBeNull();
    await fireEvent.press(screen.getByTestId('spoiler-cover'));
    expect(screen.getByTestId('review-text')).toBeTruthy();
  });
});

describe('LogForm', () => {
  it('submits rating, like, review and normalised tags', async () => {
    const onSubmit = jest.fn();
    await render(<LogForm onSubmit={onSubmit} />);
    await press(screen.getByTestId('log-rating'), 76 * 2); // size 34 -> 38px cells, 152px -> 4 stars
    await fireEvent.press(screen.getByTestId('log-like'));
    await fireEvent.changeText(screen.getByTestId('log-review'), '  Loved it  ');
    await fireEvent.changeText(screen.getByLabelText('Tags'), 'Cinema, with friends, cinema');
    await fireEvent.press(screen.getByTestId('log-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const v = onSubmit.mock.calls[0][0];
    expect(v.rating).toBe(4);
    expect(v.liked).toBe(true);
    expect(v.review).toBe('Loved it');
    expect(v.tags).toEqual(['cinema', 'with-friends']);
    expect(v.watched_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('pre-fills when editing and marks rewatch for films already logged', async () => {
    const onSubmit = jest.fn();
    await render(<LogForm onSubmit={onSubmit} alreadyWatched initial={{ rating: 2.5, review: 'meh' }} />);
    await fireEvent.press(screen.getByTestId('log-submit'));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ rating: 2.5, review: 'meh', is_rewatch: true });
  });
});
