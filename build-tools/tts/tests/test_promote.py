import pytest

import generate_audio as mod
from generate_audio import (
    build_arg_parser,
    existing_takes,
    promote_staging,
    set_fully_promoted,
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

SET_TEXT = '''
@voice Gacrux
@name diva

[elapsed/006]
@text Six minutes have passed.

[elapsed/012]
@text Twelve minutes have passed.

[elapsed/018]
@text Eighteen minutes have passed.
'''


@pytest.fixture
def promote_set(tmp_path, monkeypatch):
    """Drive main() with --promote against a temp staging dir and asset tree."""
    set_file = tmp_path / 'set.txt'
    set_file.write_text(SET_TEXT)
    staging = tmp_path / '.staging/set'
    assets = tmp_path / 'assets'

    monkeypatch.setattr(mod, 'staging_dir_for', lambda path: str(staging))
    monkeypatch.setattr(mod, 'DEFAULT_OUTPUT_DIR', str(assets))

    def run():
        args = build_arg_parser().parse_args([str(set_file), '--promote'])
        with pytest.raises(SystemExit) as exit:
            mod.main(args)
        return exit.value.code

    return run, staging, assets


def test_partial_staging_is_refused_while_the_set_is_not_in_assets(promote_set):
    run, staging, assets = promote_set
    write(staging / 'elapsed/006/diva-1.wav', b'take-A')

    assert run() == 1
    assert not (assets / 'elapsed/006/diva-1.wav').exists()


def test_empty_staging_says_so_instead_of_reporting_a_partial_batch(promote_set, capsys):
    run, _, assets = promote_set
    for event in ('elapsed/006', 'elapsed/012', 'elapsed/018'):
        write(assets / event / 'diva-1.wav', b'first-batch')

    assert run() == 0
    output = capsys.readouterr().out
    assert 'Nothing staged' in output
    assert 'Partial batch' not in output


def test_partial_staging_promotes_once_every_event_has_a_take(promote_set):
    run, staging, assets = promote_set
    for event in ('elapsed/006', 'elapsed/012', 'elapsed/018'):
        write(assets / event / 'diva-1.wav', b'first-batch')
    write(staging / 'elapsed/006/diva-1.wav', b'second-batch')

    assert run() == 0
    assert (assets / 'elapsed/006/diva-2.wav').read_bytes() == b'second-batch'


def test_set_fully_promoted_requires_every_event(tmp_path):
    _, blocks = mod.parse_set_file(str(write_set(tmp_path)))
    assets = tmp_path / 'assets'
    write(assets / 'elapsed/006/diva-1.wav', b'a')
    write(assets / 'elapsed/012/diva-1.wav', b'b')

    assert not set_fully_promoted(blocks, str(assets))

    write(assets / 'elapsed/018/diva-2.wav', b'c')  # any take number counts
    assert set_fully_promoted(blocks, str(assets))


def write_set(tmp_path):
    set_file = tmp_path / 'set.txt'
    set_file.write_text(SET_TEXT)
    return set_file
