from __future__ import annotations

DEFAULT_RATING = 100
K_FACTOR = 10
MIN_WIN_DELTA = 1


def expected_score(rating_a: int, rating_b: int) -> float:
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400))


def compute_match_deltas(winner_rating: int, loser_rating: int) -> tuple[int, int]:
    expected = expected_score(winner_rating, loser_rating)
    win_delta = max(MIN_WIN_DELTA, round(K_FACTOR * (1 - expected)))
    return win_delta, -win_delta
