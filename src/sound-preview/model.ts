import { SOUND_SETS, SOUND_VARIANTS } from '../lib/sound-manifest'
import { buildPreviewModel } from './preview-model'

// The manifest is static build output, so the model is computed once at
// module scope rather than recomputed per render.
export const previewModel = buildPreviewModel({ variants: SOUND_VARIANTS, sets: SOUND_SETS })
