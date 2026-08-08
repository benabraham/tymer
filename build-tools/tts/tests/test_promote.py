from types import SimpleNamespace

import pytest

import sounds as mod
from sounds import (
    build_arg_parser,
    existing_takes,
    promote_staging,
)

# --- promote_staging ---------------------------------------------------------


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def test_new_clip_lands_under_its_own_name(tmp_path):
    staging, assets = tmp_path / 'staging', tmp_path / 'assets'
    write(staging / 'elapsed/006/diva-1.wav', b'take-A')

    copied, skipped = promote_staging(str(staging), str(assets))

    assert copied == ['elapsed/006/diva-1.wav']
    assert skipped == []
    assert (assets / 'elapsed/006/diva-1.wav').read_bytes() == b'take-A'


def test_differing_clip_lands_at_the_next_free_number(tmp_path):
    staging, assets = tmp_path / 'staging', tmp_path / 'assets'
    write(assets / 'elapsed/006/diva-1.wav', b'take-A')
    write(staging / 'elapsed/006/diva-1.wav', b'take-B')

    copied, skipped = promote_staging(str(staging), str(assets))

    assert copied == ['elapsed/006/diva-2.wav']
    assert (assets / 'elapsed/006/diva-2.wav').read_bytes() == b'take-B'
    assert (assets / 'elapsed/006/diva-1.wav').read_bytes() == b'take-A'


def test_identical_clip_is_skipped_even_after_an_earlier_rename(tmp_path):
    # A previous partial promote renamed this clip to diva-2. Re-promoting the
    # same staging must recognize it there, not pile up a diva-3 duplicate.
    staging, assets = tmp_path / 'staging', tmp_path / 'assets'
    write(assets / 'elapsed/006/diva-1.wav', b'take-A')
    write(assets / 'elapsed/006/diva-2.wav', b'take-B')
    write(staging / 'elapsed/006/diva-1.wav', b'take-B')

    copied, skipped = promote_staging(str(staging), str(assets))

    assert copied == []
    assert skipped == ['elapsed/006/diva-1.wav']
    assert not (assets / 'elapsed/006/diva-3.wav').exists()


def test_other_sets_takes_are_neither_matched_nor_touched(tmp_path):
    staging, assets = tmp_path / 'staging', tmp_path / 'assets'
    write(assets / 'elapsed/006/brisk-1.wav', b'take-A')
    write(staging / 'elapsed/006/diva-1.wav', b'take-A')

    copied, skipped = promote_staging(str(staging), str(assets))

    assert copied == ['elapsed/006/diva-1.wav']
    assert (assets / 'elapsed/006/brisk-1.wav').read_bytes() == b'take-A'


def test_existing_takes_matches_only_the_same_stem(tmp_path):
    folder = tmp_path / 'elapsed/006'
    write(folder / 'diva-1.wav', b'a')
    write(folder / 'diva-2.wav', b'b')
    write(folder / 'brisk-1.wav', b'c')
    write(folder / 'diva-notatake.wav', b'd')

    takes = existing_takes(str(folder / 'diva-1.wav'))

    assert [t.split('/')[-1] for t in takes] == ['diva-1.wav', 'diva-2.wav']


# --- the promote gate --------------------------------------------------------

SET_TEXT = """
@voice Gacrux
@name diva

[elapsed/006]
@text Six minutes have passed.

[elapsed/012]
@text Twelve minutes have passed.

[elapsed/018]
@text Eighteen minutes have passed.
"""


EVENTS = ('elapsed/006', 'elapsed/012', 'elapsed/018')


@pytest.fixture
def promote_set(tmp_path, monkeypatch):
    """Drive the promote command against a temp staging dir and asset tree."""
    set_file = tmp_path / 'set.txt'
    set_file.write_text(SET_TEXT)
    staging = tmp_path / '.staging/set'
    assets = tmp_path / 'assets'
    normalized = tmp_path / 'normalized'

    monkeypatch.setattr(mod, 'staging_dir_for', lambda path: str(staging))
    monkeypatch.setattr(mod, 'DEFAULT_OUTPUT_DIR', str(assets))
    monkeypatch.setattr(mod, 'NORMALIZED_DIR', str(normalized))

    converted = []
    monkeypatch.setattr(mod, 'normalize', lambda paths: converted.append(list(paths)) or True)

    def run(*flags):
        args = build_arg_parser().parse_args(['promote', str(set_file), *flags])
        try:
            mod.main(args)
        except SystemExit as exit:
            return exit.code
        return None  # ran through without bailing out

    return SimpleNamespace(
        run=run,
        staging=staging,
        assets=assets,
        normalized=normalized,
        converted=converted,
    )


def stage_full_set(staging, content=b'staged'):
    for event in EVENTS:
        write(staging / event / 'diva-1.wav', content)


def promote_full_set(assets, normalized=None, content=b'first-batch'):
    for event in EVENTS:
        write(assets / event / 'diva-1.wav', content)
        if normalized is not None:
            write(normalized / event / 'diva-1.webm', b'converted')


def test_partial_staging_is_refused_while_the_set_is_not_in_assets(promote_set):
    write(promote_set.staging / 'elapsed/006/diva-1.wav', b'take-A')

    assert promote_set.run() == 1
    assert not (promote_set.assets / 'elapsed/006/diva-1.wav').exists()


def test_empty_staging_says_so_instead_of_reporting_a_partial_batch(promote_set, capsys):
    promote_full_set(promote_set.assets)

    assert promote_set.run() == 0
    output = capsys.readouterr().out
    assert 'Nothing staged' in output
    assert 'Partial batch' not in output


def test_partial_staging_promotes_once_every_event_has_a_take(promote_set):
    promote_full_set(promote_set.assets)
    write(promote_set.staging / 'elapsed/006/diva-1.wav', b'second-batch')

    assert promote_set.run() is None
    assert (promote_set.assets / 'elapsed/006/diva-2.wav').read_bytes() == b'second-batch'


def test_staging_only_the_events_new_to_a_promoted_set_is_additive(promote_set):
    # The set gained an event after its first promote (a new block in the
    # prompt file). Staging just that event must promote: every OTHER event is
    # already covered by a promoted take, so nothing can end up half-updated.
    for event in ('elapsed/006', 'elapsed/012'):
        write(promote_set.assets / event / 'diva-1.wav', b'first-batch')
    write(promote_set.staging / 'elapsed/018/diva-1.wav', b'new-event')

    assert promote_set.run() is None
    assert (promote_set.assets / 'elapsed/018/diva-1.wav').read_bytes() == b'new-event'


def test_staging_that_leaves_an_event_with_no_take_anywhere_is_refused(promote_set):
    # One event promoted, one staged, one with nothing at all — the uncovered
    # event is what the refusal is about.
    write(promote_set.assets / 'elapsed/006/diva-1.wav', b'first-batch')
    write(promote_set.staging / 'elapsed/012/diva-1.wav', b'staged')

    assert promote_set.run() == 1
    assert not (promote_set.assets / 'elapsed/012/diva-1.wav').exists()


# --- what promote does around the copy ---------------------------------------


def test_promote_converts_only_what_it_copied_then_clears_staging(promote_set):
    promote_full_set(promote_set.assets)
    write(promote_set.staging / 'elapsed/006/diva-1.wav', b'second-batch')

    assert promote_set.run() is None
    # Not the whole bank — just the one clip that moved.
    assert promote_set.converted == [[str(promote_set.assets / 'elapsed/006/diva-2.wav')]]
    assert not promote_set.staging.exists()


def test_keep_staging_and_skip_normalize_leave_both_alone(promote_set):
    stage_full_set(promote_set.staging)

    assert promote_set.run('--skip-normalize', '--keep-staging') is None
    assert promote_set.converted == []
    assert (promote_set.staging / 'elapsed/006/diva-1.wav').exists()


def test_a_failed_conversion_keeps_staging(promote_set, monkeypatch):
    monkeypatch.setattr(mod, 'normalize', lambda paths: False)
    stage_full_set(promote_set.staging)

    assert promote_set.run() == 1
    assert (promote_set.staging / 'elapsed/006/diva-1.wav').exists()


# --- replacing a set ---------------------------------------------------------


def test_replace_removes_the_sets_earlier_takes_and_their_webm(promote_set):
    promote_full_set(promote_set.assets, promote_set.normalized)
    write(promote_set.assets / 'elapsed/006/diva-2.wav', b'an-extra-take')
    write(promote_set.normalized / 'elapsed/006/diva-2.webm', b'converted')
    stage_full_set(promote_set.staging, b'the-new-batch')

    assert promote_set.run('--replace', '--yes') is None

    # The incoming batch IS the set: the extra take is gone from both trees.
    assert not (promote_set.assets / 'elapsed/006/diva-2.wav').exists()
    assert not (promote_set.normalized / 'elapsed/006/diva-2.webm').exists()
    assert (promote_set.assets / 'elapsed/006/diva-1.wav').read_bytes() == b'the-new-batch'


def test_replace_refuses_a_partial_batch(promote_set):
    promote_full_set(promote_set.assets)
    write(promote_set.staging / 'elapsed/006/diva-1.wav', b'the-new-batch')

    assert promote_set.run('--replace', '--yes') == 1
    # Nothing deleted — a partial replace would leave the other events silent.
    assert (promote_set.assets / 'elapsed/012/diva-1.wav').exists()


def test_replace_without_a_yes_asks_and_leaves_everything_where_it_is(promote_set):
    """pytest's stdin is not a terminal, so confirm() has nobody to ask."""
    promote_full_set(promote_set.assets)
    stage_full_set(promote_set.staging, b'the-new-batch')

    assert promote_set.run('--replace') == 1
    assert (promote_set.assets / 'elapsed/006/diva-1.wav').read_bytes() == b'first-batch'


def test_replace_leaves_other_sets_alone(promote_set):
    promote_full_set(promote_set.assets)
    write(promote_set.assets / 'elapsed/006/brisk-1.wav', b'another-voice')
    write(promote_set.normalized / 'elapsed/006/brisk-1.webm', b'converted')
    stage_full_set(promote_set.staging, b'the-new-batch')

    assert promote_set.run('--replace', '--yes') is None
    assert (promote_set.assets / 'elapsed/006/brisk-1.wav').exists()
    assert (promote_set.normalized / 'elapsed/006/brisk-1.webm').exists()


# --- the normalized counterpart ----------------------------------------------


def test_normalized_counterpart_mirrors_the_path_and_swaps_the_extension(tmp_path, monkeypatch):
    monkeypatch.setattr(mod, 'NORMALIZED_DIR', str(tmp_path / 'public'))
    assets = str(tmp_path / 'assets')

    counterpart = mod.normalized_counterpart(f'{assets}/elapsed/006/diva-2.wav', assets)

    assert counterpart == str(tmp_path / 'public/elapsed/006/diva-2.webm')


def test_normalized_counterpart_is_none_outside_the_source_tree(tmp_path, monkeypatch):
    """No counterpart to reason about — and guessing one would delete elsewhere."""
    monkeypatch.setattr(mod, 'NORMALIZED_DIR', str(tmp_path / 'public'))

    assert mod.normalized_counterpart('/elsewhere/diva-1.wav', str(tmp_path / 'assets')) is None


# --- discarding a staged set -------------------------------------------------


def test_discard_clears_a_set_inside_staging(tmp_path, monkeypatch):
    monkeypatch.setattr(mod, 'TOOL_DIR', str(tmp_path))
    staging = tmp_path / '.staging/set'
    write(staging / 'elapsed/006/diva-1.wav', b'a')
    write(staging / 'elapsed/012/diva-1.wav', b'b')

    assert mod.discard_staged_set(str(staging)) == 2
    assert not staging.exists()


def test_discard_refuses_anything_that_is_not_a_staged_set(tmp_path, monkeypatch):
    monkeypatch.setattr(mod, 'TOOL_DIR', str(tmp_path))
    assets = tmp_path / 'assets'
    write(assets / 'elapsed/006/diva-1.wav', b'a')

    with pytest.raises(ValueError):
        mod.discard_staged_set(str(assets))
    # ...including the staging root, which would take every other set with it.
    with pytest.raises(ValueError):
        mod.discard_staged_set(str(tmp_path / '.staging'))
    assert (assets / 'elapsed/006/diva-1.wav').exists()


# --- the three generation modes ----------------------------------------------


@pytest.fixture
def generate_set(tmp_path, monkeypatch):
    """Drive the generating commands with no API and no real clips written."""
    set_file = tmp_path / 'set.txt'
    set_file.write_text(SET_TEXT)
    staging = tmp_path / '.staging/set'

    monkeypatch.setattr(mod, 'TOOL_DIR', str(tmp_path))
    monkeypatch.setattr(mod, 'staging_dir_for', lambda path: str(staging))
    monkeypatch.setenv('GEMINI_API_KEYS', 'key-one')
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    monkeypatch.setattr(mod.genai, 'Client', lambda **kwargs: object())

    calls = []
    monkeypatch.setattr(
        mod,
        'generate_clip',
        lambda client, block, base_output_dir, overwrite=False: calls.append(
            (block['path'], overwrite)
        ),
    )

    def run(command, *flags):
        calls.clear()
        args = build_arg_parser().parse_args([command, str(set_file), '--delay', '0', *flags])
        try:
            mod.main(args)
        except SystemExit:
            pass
        return list(calls)

    return SimpleNamespace(run=run, staging=staging, calls=calls)


def test_generate_only_fills_in_what_is_missing(generate_set):
    write(generate_set.staging / 'elapsed/006/diva-1.wav', b'already-there')

    assert [path for path, _ in generate_set.run('generate')] == ['elapsed/012', 'elapsed/018']


def test_regenerate_redoes_everything_over_take_one(generate_set):
    write(generate_set.staging / 'elapsed/006/diva-1.wav', b'already-there')

    done = generate_set.run('regenerate')

    assert [path for path, _ in done] == ['elapsed/006', 'elapsed/012', 'elapsed/018']
    assert all(overwrite for _, overwrite in done), 'regenerate writes over take -1'
    # Nothing deleted: takes from an earlier, longer batch survive.
    assert (generate_set.staging / 'elapsed/006/diva-1.wav').exists()


def test_fresh_throws_the_staged_batch_away_first(generate_set):
    write(generate_set.staging / 'elapsed/006/diva-1.wav', b'already-there')
    write(generate_set.staging / 'elapsed/006/diva-2.wav', b'an-extra-take')

    done = generate_set.run('regenerate', '--fresh', '--yes')

    assert [path for path, _ in done] == ['elapsed/006', 'elapsed/012', 'elapsed/018']
    assert not (generate_set.staging / 'elapsed/006/diva-2.wav').exists()


def test_fresh_without_a_yes_keeps_the_staged_batch(generate_set):
    """pytest's stdin is not a terminal, so confirm() has nobody to ask."""
    write(generate_set.staging / 'elapsed/006/diva-1.wav', b'already-there')

    assert generate_set.run('regenerate', '--fresh') == []
    assert (generate_set.staging / 'elapsed/006/diva-1.wav').exists()


# --- the command surface -----------------------------------------------------


def test_generate_and_regenerate_share_a_surface_but_only_one_can_start_over():
    parser = build_arg_parser()

    assert parser.parse_args(['generate', 'a-set']).audition == 'off'
    assert parser.parse_args(['regenerate', 'a-set', '--fresh']).fresh is True
    assert parser.parse_args(['regenerate', 'a-set']).fresh is False

    with pytest.raises(SystemExit):
        parser.parse_args(['generate', 'a-set', '--fresh'])


def test_fresh_will_not_delete_an_output_directory_the_user_named(tmp_path, capsys):
    """--fresh clears the staged set. An explicit output dir could be the whole
    promoted bank, so it is refused rather than guessed at."""
    set_file = tmp_path / 'set.txt'
    set_file.write_text(SET_TEXT)
    scratch = tmp_path / 'scratch'
    write(scratch / 'elapsed/006/diva-1.wav', b'a')

    args = build_arg_parser().parse_args(
        ['regenerate', str(set_file), str(scratch), '--fresh', '--yes']
    )
    with pytest.raises(SystemExit) as exit:
        mod.main(args)

    assert exit.value.code == 1
    assert (scratch / 'elapsed/006/diva-1.wav').exists()
    assert '--fresh' in capsys.readouterr().out


def test_any_take_number_counts_as_coverage_for_the_promote_gate(promote_set):
    # An earlier promote may have renamed an event's only take to -2; the gate
    # must still count that event as covered.
    for event in ('elapsed/006', 'elapsed/012'):
        write(promote_set.assets / event / 'diva-1.wav', b'first-batch')
    write(promote_set.assets / 'elapsed/018/diva-2.wav', b'renamed-take')
    write(promote_set.staging / 'elapsed/006/diva-1.wav', b'second-batch')

    assert promote_set.run() is None
    assert (promote_set.assets / 'elapsed/006/diva-2.wav').read_bytes() == b'second-batch'
