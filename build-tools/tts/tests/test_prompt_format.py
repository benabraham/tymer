import os
import re

import pytest

from sounds import PROMPTS_DIR, load_api_keys, resolve_set_file, default_name_from_text, compose_prompt, parse_set_file, select_blocks


def set_path(name):
    return os.path.join(PROMPTS_DIR, name)


def write_set(tmp_path, content, name='set.txt'):
    path = tmp_path / name
    path.write_text(content)
    return str(path)


def test_parses_file_level_header_and_one_block(tmp_path):
    path = write_set(tmp_path, '''
@voice Gacrux
@profile Tymer

[elapsed/006]
@text Six minutes have passed.
''')
    defaults, blocks = parse_set_file(path)

    assert defaults['voice'] == 'Gacrux'
    assert defaults['profile'] == 'Tymer'
    assert len(blocks) == 1
    block = blocks[0]
    assert block['path'] == 'elapsed/006'
    assert block['voice'] == 'Gacrux'
    assert block['profile'] == 'Tymer'
    assert block['text'] == 'Six minutes have passed.'


def test_block_level_directives_override_file_level(tmp_path):
    path = write_set(tmp_path, '''
@voice Gacrux
@style Warm

[overtime/024]
@style Clipped, impatient
@text You are 24 minutes over.
''')
    _, blocks = parse_set_file(path)
    block = blocks[0]
    assert block['style'] == 'Clipped, impatient'
    assert block['voice'] == 'Gacrux'


def test_multiline_directives_stop_at_next_at_or_bracket(tmp_path):
    path = write_set(tmp_path, '''
@voice Gacrux
@scene
A quiet home office, late afternoon.
More description here.
@context
The timekeeper announces progress.

[elapsed/006]
@text
Six minutes have (calm)
already passed.
''')
    defaults, blocks = parse_set_file(path)
    assert defaults['scene'] == 'A quiet home office, late afternoon.\nMore description here.'
    assert defaults['context'] == 'The timekeeper announces progress.'
    assert blocks[0]['text'] == 'Six minutes have (calm)\nalready passed.'


def test_same_line_directive_value(tmp_path):
    path = write_set(tmp_path, '''
@voice Gacrux
@scene A quiet room.

[a/b]
@text Hello there.
''')
    defaults, blocks = parse_set_file(path)
    assert defaults['scene'] == 'A quiet room.'
    assert blocks[0]['text'] == 'Hello there.'


def test_comments_and_blank_lines_ignored(tmp_path):
    path = write_set(tmp_path, '''
# a top comment
@voice Gacrux

# another comment

[a/b]
# comment inside block area
@text Hello.
''')
    defaults, blocks = parse_set_file(path)
    assert defaults['voice'] == 'Gacrux'
    assert blocks[0]['text'] == 'Hello.'


def test_missing_file_level_voice_is_error(tmp_path):
    path = write_set(tmp_path, '''
[a/b]
@text Hello.
''')
    with pytest.raises(ValueError):
        parse_set_file(path)


def test_block_without_text_is_error_naming_line(tmp_path):
    path = write_set(tmp_path, '''
@voice Gacrux

[a/b]
@style Warm
''')
    with pytest.raises(ValueError) as excinfo:
        parse_set_file(path)
    assert '4' in str(excinfo.value)


def test_unknown_directive_is_error_naming_line(tmp_path):
    path = write_set(tmp_path, '''
@voice Gacrux
@bogus something

[a/b]
@text Hello.
''')
    with pytest.raises(ValueError) as excinfo:
        parse_set_file(path)
    assert '3' in str(excinfo.value)


def test_malformed_block_header_is_error_naming_line(tmp_path):
    path = write_set(tmp_path, '''
@voice Gacrux

[a/b
@text Hello.
''')
    with pytest.raises(ValueError) as excinfo:
        parse_set_file(path)
    assert '4' in str(excinfo.value)


def test_repeated_block_paths_both_survive(tmp_path):
    path = write_set(tmp_path, '''
@voice Gacrux

[elapsed/006]
@text First take.

[elapsed/006]
@text Second take.
''')
    _, blocks = parse_set_file(path)
    assert len(blocks) == 2
    assert blocks[0]['path'] == 'elapsed/006'
    assert blocks[1]['path'] == 'elapsed/006'
    assert blocks[0]['text'] == 'First take.'
    assert blocks[1]['text'] == 'Second take.'


def test_compose_prompt_section_order_and_transcript_last():
    block = {
        'profile': 'Tymer — a calm timekeeper',
        'scene': 'A quiet home office, late afternoon.',
        'style': 'Warm, measured',
        'pace': 'Unhurried',
        'accent': 'Neutral international English',
        'context': 'The timekeeper announces progress.',
        'text': '[calm] Six minutes have already passed.',
    }
    prompt = compose_prompt(block)

    assert prompt.index('# AUDIO PROFILE:') < prompt.index('## THE SCENE')
    assert prompt.index('## THE SCENE') < prompt.index("### DIRECTOR'S NOTES")
    assert prompt.index("### DIRECTOR'S NOTES") < prompt.index('### SAMPLE CONTEXT')
    assert prompt.index('### SAMPLE CONTEXT') < prompt.index('#### TRANSCRIPT')
    assert prompt.endswith('#### TRANSCRIPT\n[calm] Six minutes have already passed.')
    assert 'Style: Warm, measured' in prompt
    assert 'Pace: Unhurried' in prompt
    assert 'Accent: Neutral international English' in prompt


def test_compose_prompt_omits_absent_sections():
    block = {'text': 'Just the text.'}
    prompt = compose_prompt(block)

    assert '# AUDIO PROFILE' not in prompt
    assert '## THE SCENE' not in prompt
    assert "### DIRECTOR'S NOTES" not in prompt
    assert '### SAMPLE CONTEXT' not in prompt
    assert prompt == '#### TRANSCRIPT\nJust the text.'


def test_compose_prompt_omits_directors_notes_heading_when_all_three_absent():
    block = {'profile': 'P', 'text': 'Text.'}
    prompt = compose_prompt(block)
    assert "### DIRECTOR'S NOTES" not in prompt


def test_compose_prompt_keeps_partial_directors_notes():
    block = {'style': 'Warm', 'text': 'Text.'}
    prompt = compose_prompt(block)
    assert "### DIRECTOR'S NOTES" in prompt
    assert 'Style: Warm' in prompt
    assert 'Pace:' not in prompt
    assert 'Accent:' not in prompt


def test_select_blocks_only_prefix_filter():
    blocks = [
        {'path': 'overtime/024', 'text': 'a'},
        {'path': 'elapsed/006', 'text': 'b'},
        {'path': 'overtime/030', 'text': 'c'},
    ]
    result = select_blocks(blocks, only='overtime/')
    assert [b['path'] for b in result] == ['overtime/024', 'overtime/030']


def test_select_blocks_limit():
    blocks = [{'path': str(i), 'text': str(i)} for i in range(5)]
    result = select_blocks(blocks, limit=2)
    assert [b['path'] for b in result] == ['0', '1']


def test_select_blocks_only_and_limit_combined():
    blocks = [
        {'path': 'overtime/024', 'text': 'a'},
        {'path': 'elapsed/006', 'text': 'b'},
        {'path': 'overtime/030', 'text': 'c'},
        {'path': 'overtime/040', 'text': 'd'},
    ]
    result = select_blocks(blocks, only='overtime/', limit=1)
    assert [b['path'] for b in result] == ['overtime/024']


def test_tymer_sets_round_trip():
    """Both shipped sets must parse, share a voice, and cover the same events."""
    measured_defaults, measured = parse_set_file(set_path('tymer-gacrux.txt'))
    brisk_defaults, brisk = parse_set_file(set_path('tymer-gacrux-brisk.txt'))

    assert measured_defaults['voice'] == brisk_defaults['voice'] == 'Gacrux'
    assert len(measured) == len(brisk) == 33
    assert [b['path'] for b in measured] == [b['path'] for b in brisk]

    for block in measured + brisk:
        assert block['text'].strip() != ''

    # Same words in both sets — only the delivery differs.
    strip_cues = lambda t: re.sub(r'\[[^\]]*\]', '', t).split()
    for a, b in zip(measured, brisk):
        assert strip_cues(a['text']) == strip_cues(b['text'])

    # The brisk set labels every file so it cannot collide with the measured takes.
    assert set(b['name'] for b in brisk) == {'brisk'}


def test_comment_banner_terminates_multiline_value(tmp_path):
    """A '#' banner between sections must not be swallowed into the value above it."""
    set_file = tmp_path / 'set.txt'
    set_file.write_text(
        '@voice Gacrux\n'
        '@context\n'
        'The timekeeper marks the passage of a period.\n'
        '\n'
        '# ----------------------------------------\n'
        '# elapsed — neutral progress markers\n'
        '# ----------------------------------------\n'
        '\n'
        '[elapsed/006]\n'
        '@text [calm] Six minutes have already passed.\n'
        '\n'
        '# ----------------------------------------\n'
        '# overtime — the escalation ladder\n'
        '# ----------------------------------------\n'
        '\n'
        '[overtime/006]\n'
        '@text [gently] Bring your task to a close.\n'
    )

    _, blocks = parse_set_file(str(set_file))

    assert len(blocks) == 2
    for block in blocks:
        assert block['context'] == 'The timekeeper marks the passage of a period.'
        assert 'elapsed —' not in block['context']
        assert '---' not in block['text']
        assert '---' not in block['name']

    assert blocks[0]['text'] == '[calm] Six minutes have already passed.'
    assert blocks[1]['text'] == '[gently] Bring your task to a close.'
    assert blocks[0]['name'] == 'six-minutes-have-already-passed'
    assert compose_prompt(blocks[0]).endswith('#### TRANSCRIPT\n[calm] Six minutes have already passed.')


def test_default_name_drops_cues_and_truncates():
    """Bracket cues are delivery directions, not speech — keep them out of filenames."""
    assert default_name_from_text('[calm] Six minutes have already passed.') == \
        'six-minutes-have-already-passed'

    long_name = default_name_from_text(
        '[coldly] The scheduled time concluded forty-eight minutes ago. '
        '[final] All work on this task must stop now.'
    )
    assert 'coldly' not in long_name
    assert 'final' not in long_name
    assert len(long_name) <= 60
    assert not long_name.endswith('-')
    assert long_name.startswith('the-scheduled-time-concluded')


def test_explicit_name_directive_wins(tmp_path):
    set_file = tmp_path / 'set.txt'
    set_file.write_text(
        '@voice Gacrux\n'
        '[elapsed/006]\n'
        '@name six-min\n'
        '@text [calm] Six minutes have already passed.\n'
    )
    _, blocks = parse_set_file(str(set_file))
    assert blocks[0]['name'] == 'six-min'


def test_resolve_output_filename_overwrite_vs_accumulate(tmp_path):
    """Without --overwrite repeat runs accumulate takes; with it, a set replaces its own."""
    from sounds import resolve_output_filename

    folder = str(tmp_path)
    first = resolve_output_filename('brisk', '.wav', folder)
    assert first.endswith('brisk-1.wav')
    open(first, 'w').close()

    # default: next run must not clobber the existing take
    assert resolve_output_filename('brisk', '.wav', folder).endswith('brisk-2.wav')

    # --overwrite: always the set's own -1 file, no matter how many exist
    assert resolve_output_filename('brisk', '.wav', folder, overwrite=True) == first
    open(str(tmp_path / 'brisk-2.wav'), 'w').close()
    assert resolve_output_filename('brisk', '.wav', folder, overwrite=True) == first

    # a different set's takes in the same directory are untouched
    other = resolve_output_filename('measured-take', '.wav', folder, overwrite=True)
    assert other.endswith('measured-take-1.wav')
    assert os.path.exists(first)


def test_load_api_keys_reads_a_list():
    """Keys are a list, not a hardcoded _1/_2/_3 sequence."""
    assert load_api_keys({}) == []
    assert load_api_keys({'GEMINI_API_KEY': 'a'}) == ['a']

    # comma, newline and whitespace separated all work
    assert load_api_keys({'GEMINI_API_KEYS': 'a,b,c'}) == ['a', 'b', 'c']
    assert load_api_keys({'GEMINI_API_KEYS': 'a\nb\nc'}) == ['a', 'b', 'c']
    assert load_api_keys({'GEMINI_API_KEYS': 'a b  c'}) == ['a', 'b', 'c']
    assert load_api_keys({'GEMINI_API_KEYS': ' a , b ,, c '}) == ['a', 'b', 'c']

    # the list and the singular variable combine, list first, without duplicates
    assert load_api_keys({'GEMINI_API_KEYS': 'a,b', 'GEMINI_API_KEY': 'c'}) == ['a', 'b', 'c']
    assert load_api_keys({'GEMINI_API_KEYS': 'a,b', 'GEMINI_API_KEY': 'a'}) == ['a', 'b']

    assert load_api_keys({'GEMINI_API_KEY': '   '}) == []
    assert load_api_keys({'GEMINI_API_KEYS': '  '}) == []


def test_resolve_set_file_accepts_bare_name_or_path(tmp_path):
    assert resolve_set_file('tymer-gacrux').endswith('sound-prompts/tymer-gacrux.txt')
    assert resolve_set_file('tymer-gacrux.txt').endswith('sound-prompts/tymer-gacrux.txt')

    explicit = tmp_path / 'custom.txt'
    explicit.write_text('@voice Gacrux\n[a/b]\n@text Hi.\n')
    assert resolve_set_file(str(explicit)) == str(explicit)

    with pytest.raises(ValueError) as excinfo:
        resolve_set_file('no-such-set')
    assert 'tymer-gacrux' in str(excinfo.value)


def _fake_block(path, name='brisk'):
    return {'path': path, 'name': name}


def test_missing_blocks_drives_resume(tmp_path):
    """A resumed run must only cover clips that do not exist yet."""
    from sounds import expected_file, missing_blocks

    blocks = [_fake_block('elapsed/006'), _fake_block('elapsed/012'), _fake_block('timesup/work')]
    base = str(tmp_path)

    assert missing_blocks(blocks, base) == blocks

    done = expected_file(blocks[1], base)
    os.makedirs(os.path.dirname(done), exist_ok=True)
    open(done, 'w').close()

    remaining = missing_blocks(blocks, base)
    assert [b['path'] for b in remaining] == ['elapsed/006', 'timesup/work']

    for block in blocks:
        target = expected_file(block, base)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        open(target, 'w').close()
    assert missing_blocks(blocks, base) == []


def test_staging_dir_is_per_set():
    from sounds import TOOL_DIR, staging_dir_for

    a = staging_dir_for('/anywhere/sound-prompts/tymer-gacrux.txt')
    b = staging_dir_for('tymer-gacrux-brisk')

    assert a.startswith(TOOL_DIR)
    assert a.endswith('tymer-gacrux')
    assert b.endswith('tymer-gacrux-brisk')
    assert a != b


def test_promote_staging_copies_tree(tmp_path):
    from sounds import promote_staging

    staging = tmp_path / 'staging'
    (staging / 'elapsed' / '006').mkdir(parents=True)
    (staging / 'elapsed' / '006' / 'brisk-1.wav').write_bytes(b'audio')
    (staging / 'notes.txt').write_text('not audio')

    destination = tmp_path / 'assets'
    copied, skipped = promote_staging(str(staging), str(destination))

    assert copied == ['elapsed/006/brisk-1.wav']
    assert skipped == []
    assert (destination / 'elapsed' / '006' / 'brisk-1.wav').read_bytes() == b'audio'
    assert not (destination / 'notes.txt').exists()


def test_promote_merges_sets_as_alternatives(tmp_path):
    """Promoting a second set beside the first must add takes, never overwrite them."""
    from sounds import promote_staging

    destination = tmp_path / 'assets'
    event = destination / 'elapsed' / '006'
    event.mkdir(parents=True)
    (event / 'brisk-1.wav').write_bytes(b'first set')

    staging = tmp_path / 'staging'
    (staging / 'elapsed' / '006').mkdir(parents=True)
    (staging / 'elapsed' / '006' / 'brisk-1.wav').write_bytes(b'second set')

    copied, skipped = promote_staging(str(staging), str(destination))

    assert copied == ['elapsed/006/brisk-2.wav']
    assert skipped == []
    assert (event / 'brisk-1.wav').read_bytes() == b'first set'
    assert (event / 'brisk-2.wav').read_bytes() == b'second set'


def test_promote_is_idempotent_for_the_same_set(tmp_path):
    """Re-promoting an unchanged set must not pile up duplicate takes."""
    from sounds import promote_staging

    staging = tmp_path / 'staging'
    (staging / 'elapsed' / '006').mkdir(parents=True)
    (staging / 'elapsed' / '006' / 'brisk-1.wav').write_bytes(b'audio')
    destination = tmp_path / 'assets'

    first_copied, _ = promote_staging(str(staging), str(destination))
    second_copied, second_skipped = promote_staging(str(staging), str(destination))

    assert first_copied == ['elapsed/006/brisk-1.wav']
    assert second_copied == []
    assert second_skipped == ['elapsed/006/brisk-1.wav']
    assert sorted(os.listdir(destination / 'elapsed' / '006')) == ['brisk-1.wav']


def test_next_free_take_skips_occupied_numbers(tmp_path):
    from sounds import next_free_take

    event = tmp_path / 'elapsed' / '006'
    event.mkdir(parents=True)
    target = str(event / 'brisk-1.wav')
    (event / 'brisk-1.wav').write_bytes(b'a')

    assert next_free_take(target).endswith('brisk-2.wav')

    (event / 'brisk-2.wav').write_bytes(b'b')
    (event / 'brisk-3.wav').write_bytes(b'c')
    assert next_free_take(target).endswith('brisk-4.wav')


def test_key_pool_round_robins_across_keys():
    from sounds import KeyPool

    pool = KeyPool(['a', 'b', 'c'])
    assert [pool.next_key() for _ in range(7)] == ['a', 'b', 'c', 'a', 'b', 'c', 'a']
    assert pool.requests == {'a': 3, 'b': 2, 'c': 2}


def test_key_pool_retires_after_three_rate_limits():
    from sounds import KeyPool

    pool = KeyPool(['a', 'b'])
    assert pool.record_rate_limit('a', daily=False) is False
    assert pool.record_rate_limit('a', daily=False) is False
    assert pool.active() == ['a', 'b']

    assert pool.record_rate_limit('a', daily=False) is True
    assert pool.active() == ['b']
    assert 'a' in pool.retired
    assert '3 rate limits' in pool.retire_reason['a']

    # a retired key is never handed out again
    assert {pool.next_key() for _ in range(5)} == {'b'}


def test_key_pool_retires_immediately_on_daily_quota():
    from sounds import KeyPool

    pool = KeyPool(['a', 'b'])
    assert pool.record_rate_limit('a', daily=True) is True
    assert pool.active() == ['b']
    assert pool.retire_reason['a'] == 'daily quota reached'


def test_key_pool_reports_when_everything_is_exhausted():
    from sounds import KeyPool

    pool = KeyPool(['a', 'b'])
    assert pool.all_exhausted() is False

    for key in ('a', 'b'):
        pool.record_rate_limit(key, daily=True)

    assert pool.all_exhausted() is True
    assert pool.next_key() is None

    summary = '\n'.join(pool.summary_lines())
    assert 'key 1' in summary and 'key 2' in summary
    assert summary.count('daily quota reached') == 2


def test_key_pool_summary_marks_survivors():
    from sounds import KeyPool

    pool = KeyPool(['aaaaaaaaaaaa', 'bbbbbbbbbbbb'])
    pool.next_key()
    pool.record_rate_limit('aaaaaaaaaaaa', daily=True)

    summary = pool.summary_lines()
    assert 'daily quota reached' in summary[0]
    assert 'still available' in summary[1]


def test_command_hint_prefers_the_launcher_that_announced_itself():
    """The `sounds` shell function chdirs, so it is invisible from in here — it
    says so in the environment, and hints must name it over anything inferred."""
    from sounds import REPO_ROOT, command_hint

    env = {'INIT_CWD': REPO_ROOT, 'npm_lifecycle_event': 'sounds:generate',
           'TYMER_SOUNDS_LAUNCHER': 'sounds'}
    assert command_hint(env, 'promote') == 'sounds promote'


def test_command_hint_names_the_package_script_when_run_through_pnpm():
    from sounds import REPO_ROOT, command_hint

    env = {'INIT_CWD': REPO_ROOT, 'npm_lifecycle_event': 'sounds:generate'}
    assert command_hint(env, 'promote') == 'pnpm run sounds:promote'


def test_command_hint_falls_back_to_the_passthrough_script():
    """Only generate and promote have a script of their own; the rest go through
    `pnpm run sounds <subcommand>`, which pnpm forwards as an argument."""
    from sounds import REPO_ROOT, command_hint

    env = {'INIT_CWD': REPO_ROOT, 'npm_lifecycle_event': 'sounds:generate'}
    assert command_hint(env, 'audition') == 'pnpm run sounds audition'
    assert command_hint(env, 'regenerate') == 'pnpm run sounds regenerate'


def test_command_hint_from_the_tools_own_directory():
    from sounds import TOOL_DIR, command_hint

    assert command_hint({'INIT_CWD': TOOL_DIR}, 'promote') == 'uv run sounds.py promote'


def test_command_hint_from_anywhere_else_spells_out_the_directory():
    from sounds import TOOL_DIR, command_hint

    hint = command_hint({'INIT_CWD': '/somewhere/unrelated'}, 'generate')
    assert hint == f'uv run --directory {TOOL_DIR} sounds.py generate'


def test_normalize_hint_is_relative_inside_the_repo_absolute_outside():
    from sounds import REPO_ROOT, TOOL_DIR, normalize_hint

    assert normalize_hint({'INIT_CWD': REPO_ROOT}) == './normalize_audio.sh'
    assert normalize_hint({'INIT_CWD': TOOL_DIR}) == '../../normalize_audio.sh'
    assert normalize_hint({'INIT_CWD': '/somewhere/unrelated'}) == os.path.join(REPO_ROOT, 'normalize_audio.sh')


def test_shell_cwd_prefers_init_cwd_because_the_launchers_chdir(tmp_path, monkeypatch):
    """pnpm/uv both chdir into the tool dir, so os.getcwd() is not where the
    user is. INIT_CWD is what carries that across."""
    from sounds import TOOL_DIR, shell_cwd

    monkeypatch.chdir(TOOL_DIR)
    assert shell_cwd({'INIT_CWD': str(tmp_path)}) == os.path.realpath(str(tmp_path))
    assert shell_cwd({}) == os.path.realpath(TOOL_DIR)


# The block paths generate-sound-manifest.js turns into manifest keys. Anything
# else is generated, normalized, precached and then never played, because
# sounds.js can only reach a clip through a manifest key.
RECOGNIZED_BLOCK_PATHS = re.compile(
    r'^(?:'
    r'overtime/break/\d+'
    r'|(?:elapsed|remaining|overtime)/\d+'
    r'|timesup/[a-zA-Z-]+'
    r')$'
)


@pytest.mark.parametrize('set_name', ['tymer-gacrux.txt', 'tymer-gacrux-brisk.txt', 'tymer-kore-strict.txt'])
def test_every_block_path_reaches_the_app(set_name):
    """No set may contain a block the manifest generator would ignore.

    An `alternatives/` section survived three sets this way: the clips were
    generated, promoted, converted and shipped in the PWA precache, but the
    generator has no rule for that path, so no key existed and nothing could
    ever play them.
    """
    _, blocks = parse_set_file(set_path(set_name))

    unreachable = [b['path'] for b in blocks if not RECOGNIZED_BLOCK_PATHS.match(b['path'])]
    assert unreachable == [], f'{set_name}: block paths the app cannot reach: {unreachable}'
