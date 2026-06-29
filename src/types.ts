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
 * Global options for the link plugin.
 */
export interface LinkFieldPluginOptions {
  /** Additional schema fields appended to the built-in link fields. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fields?: any[]

  /**
   * Global route configuration for the link picker UI.
   * Individual fields can override this via `options.routes`.
   */
  routes?: LinkRouteDefinition[] | LinksPluginProps

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
  pluginOptions?: Pick<LinkFieldPluginOptions, 'routes'>
}