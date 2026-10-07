import { describe, expect, it } from 'vitest'
import { userMessageFromError } from './errors'

describe('messages d’erreur publics', () => {
  it('traduit les erreurs métier connues', () => {
    expect(userMessageFromError({ message: 'Montant reçu insuffisant' })).toBe('Le montant reçu est insuffisant.')
    expect(userMessageFromError({ message: 'Un produit est introuvable ou indisponible' })).toContain('indisponible')
    expect(userMessageFromError({ message: 'JWT expired' })).toContain('session a expiré')
    expect(userMessageFromError({ message: 'Fournisseur inactif ou introuvable' })).toContain('fournisseur est inactif')
    expect(userMessageFromError({ message: 'Montant supérieur au reste dû' })).toContain('dépasse le reste dû')
    expect(userMessageFromError({ message: 'Un achat déjà réceptionné ne peut pas être annulé directement.' })).toContain('ne peut pas être annulé')
    expect(userMessageFromError({ message: "Cette matière première est déjà présente dans l'achat." })).toContain('déjà présente')
  })

  it('ne révèle pas une erreur SQL inconnue', () => {
    const sql = 'duplicate key value violates constraint ventes_numero_key'
    expect(userMessageFromError({ message: sql })).not.toContain('ventes_numero_key')
    expect(userMessageFromError({ message: 'syntax error at or near SELECT' })).toBe('Une erreur est survenue. Veuillez réessayer.')
  })
})
