import { readFileSync } from 'node:fs'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { parse } from 'yaml'
import type { components } from '../api/types'

// Helpers de test adossés à contracts/openapi.yaml : validation JSON Schema des
// payloads et accès aux exemples du contrat, pour que les fixtures viennent du
// contrat lui-même et non d'une copie à la main.

const CONTRACT_URL = new URL('../../../contracts/openapi.yaml', import.meta.url)

type Json = Record<string, any>

export const contract: Json = parse(readFileSync(CONTRACT_URL, 'utf8'))

const ajv = new Ajv({ strict: false, allErrors: true })
addFormats(ajv)
ajv.addSchema(contract, 'contract')

export type SchemaName = keyof components['schemas']

/** Liste des violations du schéma `name` (vide si conforme). */
export function schemaErrors(name: SchemaName, data: unknown): string[] {
  const validate = ajv.getSchema(`contract#/components/schemas/${name}`)
  if (!validate) throw new Error(`Schéma inconnu dans le contrat : ${name}`)
  if (validate(data)) return []
  return (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`)
}

/** Corps d'exemple d'une réponse du contrat (`example`, ou `examples[name].value`). */
export function responseExample<T>(path: string, method: string, status: number, name?: string): T {
  const media = contract.paths[path]?.[method]?.responses?.[status]?.content?.['application/json']
  if (!media) throw new Error(`Réponse absente du contrat : ${method.toUpperCase()} ${path} ${status}`)
  const value = name ? media.examples?.[name]?.value : media.example
  if (value === undefined) throw new Error(`Exemple absent : ${method.toUpperCase()} ${path} ${status} ${name ?? ''}`)
  return structuredClone(value) as T
}

/** Corps d'exemple d'une requête du contrat. */
export function requestExample<T>(path: string, method: string): T {
  const value = contract.paths[path]?.[method]?.requestBody?.content?.['application/json']?.example
  if (value === undefined) throw new Error(`Exemple de requête absent : ${method.toUpperCase()} ${path}`)
  return structuredClone(value) as T
}

/** Exemple d'une réponse d'erreur partagée (`components.responses`). */
export function errorExample(name: keyof components['responses']): components['schemas']['Error'] {
  return structuredClone(contract.components.responses[name].content['application/json'].example)
}
