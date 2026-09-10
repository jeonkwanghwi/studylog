from app.domain import settle_outcome


def test_meeting_the_goal_increases_streak_and_pays_back():
    out = settle_outcome(total=70, goal=60, streak=4, daily_payback=1000)
    assert out == ("success", 1000, 5)


def test_exactly_the_goal_counts_as_success():
    assert settle_outcome(total=60, goal=60, streak=0, daily_payback=1000).result == "success"


def test_shortfall_breaks_the_streak_and_pays_nothing():
    """실패한 날의 몫은 서비스에 귀속된다. 이게 이 모델의 매출이다."""
    out = settle_outcome(total=10, goal=60, streak=7, daily_payback=1000)
    assert out == ("failed", 0, 0)


def test_zero_minutes_is_a_shortfall():
    assert settle_outcome(total=0, goal=60, streak=1, daily_payback=1000).result == "failed"


def test_success_without_an_active_challenge_pays_nothing():
    """챌린지 없이도 앱은 쓸 수 있다. streak는 오르고 크레딧만 안 쌓인다."""
    out = settle_outcome(total=70, goal=60, streak=4, daily_payback=0)
    assert out == ("success", 0, 5)
