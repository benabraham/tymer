import re
from datetime import datetime, timedelta, timezone

import pytest

import generate_audio as mod
from generate_audio import (
    KeyPool,
    RateLimited,
    build_arg_parser,
    format_duration,
    format_local,
    pacific_reset_at,
    quota_reset_notice,
)


# --- reset-time reporting ---------------------------------------------------

def test_reset_lands_on_midnight_pacific():
    reset = pacific_reset_at()
    pacific = reset.utcoffset()  # the datetime is already in Pacific
    assert (reset.hour, reset.minute, reset.second) == (0, 0, 0)
    assert pacific in (timedelta(hours=-7), timedelta(hours=-8))
    assert reset > datetime.now(timezone.utc)


def test_format_duration_is_coarse():
    assert format_duration(5) == '5s'
    assert format_duration(90) == '1m'
    assert format_duration(3600 * 3 + 720) == '3h 12m'
    assert format_duration(-10) == '0s'


def test_format_local_names_the_day_only_when_it_differs():
    now = datetime.now().astimezone()
    assert format_local(now) == f'{now:%H:%M}'

    other_day = now + timedelta(days=1)
    assert format_local(other_day).startswith(f'{other_day:%H:%M} ')
    assert f'{other_day:%a}' in format_local(other_day)


def test_notice_gives_a_local_clock_time_and_a_countdown():
    notice = quota_reset_notice()
    assert re.match(r'^at \d{2}:\d{2}.* local time — in (\d+h )?\d+[ms]$', notice), notice


# --- key pool ---------------------------------------------------------------

def test_revive_clears_retirement_but_keeps_request_counts():
    pool = KeyPool(['k1', 'k2'])
    pool.next_key()
    pool.record_rate_limit('k1', daily=True)
    pool.record_rate_limit('k2', daily=True)
    assert pool.all_exhausted()

    pool.revive()

    assert pool.active() == ['k1', 'k2']
    assert pool.strikes == {'k1': 0, 'k2': 0}
    assert pool.requests['k1'] == 1
    assert pool.retire_reason == {}


# --- the run loop -----------------------------------------------------------

SET_TEXT = '''
@voice Gacrux

[elapsed/006]
@text Six minutes have passed.

[elapsed/012]
@text Twelve minutes have passed.

[elapsed/018]
@text Eighteen minutes have passed.
'''


@pytest.fixture
def run_set(tmp_path, monkeypatch):
    """Drive main() over a three-block set with two keys and no real API."""
    set_file = tmp_path / 'set.txt'
    set_file.write_text(SET_TEXT)
    output_dir = tmp_path / 'out'

    monkeypatch.setenv('GEMINI_API_KEYS', 'key-one,key-two')
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    monkeypatch.setattr(mod.genai, 'Client', lambda **kwargs: object())

    def run(generate, waits_granted):
        calls = []
        offers = []

        def fake_generate(client, block, base_output_dir, overwrite=False):
            calls.append(block['path'])
            generate(len(calls))

        def fake_wait():
            offers.append(True)
            return waits_granted.pop(0) if waits_granted else False

        monkeypatch.setattr(mod, 'generate_audio', fake_generate)
        monkeypatch.setattr(mod, 'wait_for_quota_reset', fake_wait)

        args = build_arg_parser().parse_args([str(set_file), str(output_dir), '--delay', '0'])
        status = None
        try:
            mod.main(args)
        except SystemExit as exit:
            status = exit.code
        return calls, offers, status

    return run


def test_run_resumes_where_it_stopped_once_quota_is_back(run_set):
    def generate(call_number):
        # Both keys hit their daily limit on the first block, then the reset
        # is waited out and every block goes through.
        if call_number <= 2:
            raise RateLimited(5, daily=True)

    calls, offers, status = run_set(generate, waits_granted=[True])

    assert len(offers) == 1
    assert status is None  # ran to completion
    # The block that was in flight when the quota ran out is retried, not lost.
    assert calls == ['elapsed/006'] * 3 + ['elapsed/012', 'elapsed/018']


def test_run_keeps_what_it_already_generated_before_the_wait(run_set):
    def generate(call_number):
        if call_number in (2, 3):  # both keys die on the second block
            raise RateLimited(5, daily=True)

    calls, offers, status = run_set(generate, waits_granted=[True])

    assert len(offers) == 1
    assert status is None
    assert calls == ['elapsed/006', 'elapsed/012', 'elapsed/012', 'elapsed/012', 'elapsed/018']


def test_declining_the_wait_ends_the_run_with_a_failure_status(run_set):
    def generate(call_number):
        raise RateLimited(5, daily=True)

    calls, offers, status = run_set(generate, waits_granted=[False])

    assert len(offers) == 1
    assert status == 1
    assert calls == ['elapsed/006', 'elapsed/006']
