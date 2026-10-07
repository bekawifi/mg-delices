import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { UpdatePanel } from './UpdatePanel'

describe('panneau de mise à jour', () => {
  it('masque le bouton updater dans la version Web', () => {
    const html = renderToStaticMarkup(<UpdatePanel/>)
    expect(html).toContain('déploiement Web')
    expect(html).not.toContain('Rechercher une mise à jour')
  })
})
