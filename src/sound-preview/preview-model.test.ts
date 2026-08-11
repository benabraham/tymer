import { describe, expect, it } from 'vitest'
import type { SoundVariant } from '../lib/sound-manifest'
import { SOUND_SETS, SOUND_VARIANTS } from '../lib/sound-manifest'
import { buildPreviewModel } from './preview-model'

describe('buildPreviewModel', () => {
    it('returns an empty model for empty input', () => {
        const model = buildPreviewModel({ variants: {}, sets: [] })

        expect(model).toEqual({
            sets: [],
            banks: [],
            shared: [],
            totals: { events: 0, sets: 0, takes: 0 },
        })
    })

    it('puts an all-null-set key into shared, never into a bank', () => {
        const button: SoundVariant[] = [{ src: '/tymer/sounds/button.webm', set: null }]
        const model = buildPreviewModel({ variants: { button }, sets: [] })

        expect(model.shared).toEqual([{ key: 'button', label: 'Button', takes: button }])
        expect(model.banks).toEqual([])
    })

    it('labels timerFinished shared row, and falls back on unknown keys', () => {
        const take: SoundVariant[] = [{ src: 'x', set: null }]
        const model = buildPreviewModel({
            variants: { timerFinished: take, mystery_key: take },
            sets: [],
        })

        expect(model.shared).toEqual(
            expect.arrayContaining([
                { key: 'timerFinished', label: 'Timer finished', takes: take },
                { key: 'mystery_key', label: 'mystery_key', takes: take },
            ]),
        )
    })

    it('collapses every notification_<n> key into a single shared row', () => {
        const take1: SoundVariant[] = [{ src: 'notif-1.ogg', set: null }]
        const take2: SoundVariant[] = [{ src: 'notif-2.ogg', set: null }]
        const model = buildPreviewModel({
            variants: { notification_1: take1, notification_2: take2 },
            sets: [],
        })

        expect(model.shared).toEqual([
            { key: 'notification', label: 'Notification', takes: [...take1, ...take2] },
        ])
    })

    it('orders collapsed notification takes numerically by key, not lexically (9 before 10)', () => {
        const take9: SoundVariant[] = [{ src: 'notif-9.ogg', set: null }]
        const take10: SoundVariant[] = [{ src: 'notif-10.ogg', set: null }]
        const model = buildPreviewModel({
            variants: { notification_10: take10, notification_9: take9 },
            sets: [],
        })

        expect(model.shared[0].takes).toEqual([...take9, ...take10])
    })

    it('keeps button and timerFinished as their own single-take rows, unchanged', () => {
        const buttonTake: SoundVariant[] = [{ src: 'button.webm', set: null }]
        const finishedTake: SoundVariant[] = [{ src: 'finished.webm', set: null }]
        const model = buildPreviewModel({
            variants: { button: buttonTake, timerFinished: finishedTake },
            sets: [],
        })

        expect(model.shared).toEqual(
            expect.arrayContaining([
                { key: 'button', label: 'Button', takes: buttonTake },
                { key: 'timerFinished', label: 'Timer finished', takes: finishedTake },
            ]),
        )
    })

    it('orders shared rows: collapsed notification group first, then button, then timerFinished', () => {
        const take: SoundVariant[] = [{ src: 'x', set: null }]
        const model = buildPreviewModel({
            variants: {
                timerFinished: take,
                notification_10: take,
                button: take,
                notification_2: take,
            },
            sets: [],
        })

        expect(model.shared.map(row => row.key)).toEqual([
            'notification',
            'button',
            'timerFinished',
        ])
    })

    it('pins totals.events to real manifest keys, not the collapsed row count', () => {
        const take: SoundVariant[] = [{ src: 'x', set: null }]
        const model = buildPreviewModel({
            variants: { notification_1: take, notification_2: take, button: take },
            sets: [],
        })

        // 3 real keys collapse into 2 shared rows (1 group + button) — totals must
        // still say 3, or a later reader could "fix" this to match row count.
        expect(model.shared).toHaveLength(2)
        expect(model.totals.events).toBe(3)
    })
})

describe('buildPreviewModel — banks', () => {
    const take = (set: string): SoundVariant[] => [{ src: `${set}.webm`, set }]

    it('puts a keyed take into its matching bank, rectangular across sets', () => {
        const model = buildPreviewModel({
            variants: { elapsed_6: take('brisk') },
            sets: ['brisk', 'diva'],
        })

        expect(model.banks).toEqual([
            {
                id: 'elapsed',
                label: 'Elapsed (work)',
                rows: [
                    {
                        key: 'elapsed_6',
                        label: '6 min',
                        cells: [
                            { set: 'brisk', takes: take('brisk') },
                            { set: 'diva', takes: [] },
                        ],
                    },
                ],
            },
        ])
    })

    it('gives elapsed_break_6 to the elapsed_break bank, not elapsed — longer prefix wins', () => {
        const model = buildPreviewModel({
            variants: { elapsed_break_6: take('brisk'), elapsed_6: take('brisk') },
            sets: ['brisk'],
        })

        const bankIds = model.banks.map(bank => bank.id)
        expect(bankIds).toEqual(['elapsed', 'elapsed_break'])
        expect(model.banks.find(bank => bank.id === 'elapsed_break')?.rows[0].key).toBe(
            'elapsed_break_6',
        )
        expect(model.banks.find(bank => bank.id === 'elapsed')?.rows[0].key).toBe('elapsed_6')
    })

    it('gives remaining_break_6 to remaining_break, not remaining', () => {
        const model = buildPreviewModel({
            variants: { remaining_break_6: take('brisk') },
            sets: ['brisk'],
        })

        expect(model.banks).toEqual([
            {
                id: 'remaining_break',
                label: 'Remaining (break)',
                rows: [
                    {
                        key: 'remaining_break_6',
                        label: '6 min',
                        cells: [{ set: 'brisk', takes: take('brisk') }],
                    },
                ],
            },
        ])
    })

    it('gives overtime_break_6 to overtime_break, not overtime', () => {
        const model = buildPreviewModel({
            variants: { overtime_break_6: take('brisk') },
            sets: ['brisk'],
        })

        expect(model.banks[0].id).toBe('overtime_break')
    })

    it('sorts rows numerically on the trailing minute, not lexically (108 after 12)', () => {
        const model = buildPreviewModel({
            variants: {
                elapsed_108: take('brisk'),
                elapsed_12: take('brisk'),
                elapsed_6: take('brisk'),
            },
            sets: ['brisk'],
        })

        expect(model.banks[0].rows.map(row => row.key)).toEqual([
            'elapsed_6',
            'elapsed_12',
            'elapsed_108',
        ])
    })

    it('orders timesup rows work, break, fun, finish regardless of input order', () => {
        const model = buildPreviewModel({
            variants: {
                timesup_finish: take('brisk'),
                timesup_fun: take('brisk'),
                timesup_break: take('brisk'),
                timesup_work: take('brisk'),
            },
            sets: ['brisk'],
        })

        expect(model.banks[0].rows.map(row => row.label)).toEqual([
            'Work',
            'Break',
            'Fun',
            'Finish',
        ])
    })

    it('emits banks in the fixed table order regardless of input order', () => {
        const model = buildPreviewModel({
            variants: {
                timesup_work: take('brisk'),
                overtime_6: take('brisk'),
                elapsed_6: take('brisk'),
                deadline_6: take('brisk'),
            },
            sets: ['brisk'],
        })

        expect(model.banks.map(bank => bank.id)).toEqual([
            'elapsed',
            'overtime',
            'deadline',
            'timesup',
        ])
    })

    it('routes a key matching no known prefix into the "other" bank', () => {
        const model = buildPreviewModel({
            variants: { something_weird: take('brisk') },
            sets: ['brisk'],
        })

        expect(model.banks).toEqual([{ id: 'other', label: 'Other', rows: expect.any(Array) }])
    })

    it('keeps manifest take order inside a cell', () => {
        const takes: SoundVariant[] = [
            { src: 'tube-1.webm', set: 'tube' },
            { src: 'tube-2.webm', set: 'tube' },
        ]
        const model = buildPreviewModel({ variants: { elapsed_6: takes }, sets: ['tube'] })

        expect(model.banks[0].rows[0].cells[0].takes).toEqual(takes)
    })

    it('computes totals across banked and shared keys', () => {
        const model = buildPreviewModel({
            variants: {
                elapsed_6: take('brisk'),
                elapsed_12: [...take('brisk'), ...take('diva')],
                button: [{ src: 'button.webm', set: null }],
            },
            sets: ['brisk', 'diva'],
        })

        expect(model.totals).toEqual({ events: 3, sets: 2, takes: 4 })
    })

    it('drops a key with an empty variant array entirely', () => {
        const model = buildPreviewModel({
            variants: { elapsed_6: [], button: [] },
            sets: [],
        })

        expect(model.banks).toEqual([])
        expect(model.shared).toEqual([])
        expect(model.totals).toEqual({ events: 0, sets: 0, takes: 0 })
    })
})

describe('buildPreviewModel — real manifest invariants', () => {
    const model = buildPreviewModel({ variants: SOUND_VARIANTS, sets: SOUND_SETS })
    const bankedKeys = model.banks.flatMap(bank => bank.rows.map(row => row.key))
    const sharedKeys = model.shared.map(row => row.key)

    it('never puts a key in both a bank and shared', () => {
        const overlap = bankedKeys.filter(key => sharedKeys.includes(key))
        expect(overlap).toEqual([])
    })

    it('places every manifest key with takes exactly once (notification_<n> mapped to the group row)', () => {
        const keysWithTakes = Object.entries(SOUND_VARIANTS)
            .filter(([, takes]) => takes.length > 0)
            .map(([key]) => (/^notification_\d+$/.test(key) ? 'notification' : key))
        const placedKeys = [...bankedKeys, ...sharedKeys]

        expect(placedKeys.sort()).toEqual([...new Set(keysWithTakes)].sort())
    })

    it('keeps every bank row rectangular across all sets', () => {
        for (const bank of model.banks) {
            for (const row of bank.rows) {
                expect(row.cells).toHaveLength(SOUND_SETS.length)
            }
        }
    })

    it('sums totals.takes to the manifest variant count', () => {
        const expectedTakes = Object.values(SOUND_VARIANTS).reduce(
            (sum, takes) => sum + takes.length,
            0,
        )
        expect(model.totals.takes).toBe(expectedTakes)
    })
})
