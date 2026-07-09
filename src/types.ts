import type {
  BaseSchemaDefinition,
  ObjectInputProps,
  ObjectSchemaType,
  PreviewConfig,
} from 'sanity'
import type {LinkRouteDefinition, LinksPluginProps} from './navigator'

export type LinkReferenceValue = {
  _type: 'reference'
  _ref: string
  _weak?: boolean
}

export type LinkValue = {
  _key?: string
  _type?: 'link'
  label?: string | null
  url?: string | null
  reference?: LinkReferenceValue | null
}

/**
 * Options for the link picker plugin (second argument to `linkPicker`).
 */
export interface LinkFieldPluginOptions {
  /** Additional schema fields appended to the built-in link fields. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fields?: any[]

  icon?: BaseSchemaDefinition['icon']

  preview?: PreviewConfig
}

/**
 * Options for an individual link field.
 */
export interface LinkFieldOptions {
  /**
   * Per-field link picker route configuration.
   * If provided, this replaces the plugin-level routes for this field.
   */
  routes?: LinkRouteDefinition[] | LinksPluginProps
}

export type LinkSchemaType = Omit<ObjectSchemaType, 'options'> & {
  options?: LinkFieldOptions
}

export type LinkInputProps = ObjectInputProps<LinkValue, LinkSchemaType> & {
  pluginOptions?: {
    routes?: LinkRouteDefinition[] | LinksPluginProps
  }
}
