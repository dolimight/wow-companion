export type ReleaseChannel = 'stable' | 'nightly'

export type ReleaseRecord = {
  tag_name: string
  published_at: string | null
  draft?: boolean
}

export type ReleaseMetadata = {
  publish: boolean
  channel: ReleaseChannel
  version: string
  tag: string
  sha: string
  previousTag: string
  name: string
  generatedAt: string
}

export type UpdateFile = { url: string; size: number; sha512: string }
export type UpdateManifest = {
  version: string
  files: UpdateFile[]
  path: string
  sha512: string
  releaseDate?: string
}
