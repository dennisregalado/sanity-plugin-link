import React from 'react'
import {
  defineField,
  definePlugin,
  defineType,
  type FieldProps,
  type ObjectInputProps,
  type SchemaTypeDefinition,
} from 'sanity'

import {LinkInput} from './input'
import {getReferenceTypesFromRoutes, normalizeLinkHref} from './navigator'
import type {LinkRouteDefinition, LinksPluginProps} from './navigator'
import type {LinkFieldPluginOptions, LinkInputProps, LinkSchemaType, LinkValue} from './types'

function resolveRoutes(
  routes: LinkRouteDefinition[] | LinksPluginProps | undefined,
): LinkRouteDefinition[] {
  if (!routes) {
    return []
  }

  return Array.isArray(routes) ? routes : routes.routes
}

/**
 * A plugin that adds a custom Link field for creating internal and external links,
 * as well as `mailto` and `tel`-links, all using the same intuitive UI.
 *
 * @param routes - Link picker routes (static paths and document folders)
 * @param options - Extra schema fields, icon, and preview. See {@link LinkFieldPluginOptions}
 *
 * @example Minimal example
 * ```ts
 * // sanity.config.ts
 * import { defineConfig } from 'sanity'
 * import { linkPicker } from 'sanity-plugin-link-picker'
 *
 * export default defineConfig({
 *  // ...
 *  plugins: [
 *    linkPicker()
 *  ]
 * })
 *
 * // mySchema.ts
 * import { defineField, defineType } from 'sanity';
 *
 * export const mySchema = defineType({
 *  // ...
 *  fields: [
 *    // ...
 *    defineField({
 *      name: 'link',
 *      title: 'Link',
 *      type: 'link'
 *    }),
 *  ]
 *});
 * ```
 *
 * @example With routes and options
 * ```ts
 * linkPicker(
 *   [
 *     route('Home', '/'),
 *     documents('Pages', 'page'),
 *   ],
 *   {
 *     fields: [
 *       defineField({ name: 'parameters', type: 'string' }),
 *     ],
 *   },
 * )
 * ```
 */
export function linkPicker(
  routes: LinkRouteDefinition[] = [],
  options: LinkFieldPluginOptions = {},
) {
  const {icon, preview, fields = []} = options
  const globalRoutes = resolveRoutes(routes)
  const globalReferenceTypes = getReferenceTypesFromRoutes(globalRoutes)
  const referenceField = globalReferenceTypes.length
    ? defineField({
        name: 'reference',
        title: 'Reference',
        type: 'reference',
        weak: true,
        options: {
          disableNew: true,
        },
        to: globalReferenceTypes.map((type) => ({type})),
      })
    : null

  const linkType = defineType({
    name: 'link',
    title: 'Link',
    type: 'object',
    icon,
    preview: preview || {
      select: {
        label: 'label',
      },
      prepare: ({label}: {label: string}) => ({
        title: label,
      }),
    },
    fields: [
      defineField({
        name: 'label',
        title: 'Label',
        type: 'string',
        placeholder: 'e.g. Shop now',
      }),
      defineField({
        name: 'url',
        title: 'URL',
        type: 'string',
        placeholder: 'Search or paste a link',
        validation: (rule) =>
          rule.custom((value) => {
            if (!value) {
              return true
            }

            if (value.trim().startsWith('?') || normalizeLinkHref(value)) {
              return true
            }

            return 'Must be a path, query string, URL, email address, or phone number'
          }),
      }),
      ...(referenceField ? [referenceField] : []),
      ...fields,
    ],
    components: {
      field: (props: FieldProps) => props.renderDefault(props),
      input: (props: ObjectInputProps) =>
        React.createElement(LinkInput, {
          ...(props as ObjectInputProps<LinkValue, LinkSchemaType>),
          pluginOptions: {
            routes,
          },
        } as LinkInputProps),
    },
  })

  return definePlugin({
    name: 'link-picker',
    schema: {
      types: [linkType as SchemaTypeDefinition],
    },
  })()
}

export {defineLinkMenu, documents, group, route} from './navigator'
export type {
  LinkDocumentFolder,
  LinkRouteDefinition,
  LinkRouteGroup,
  LinksPluginProps,
  StaticLinkRoute,
} from './navigator'
export type {
  LinkFieldOptions,
  LinkFieldPluginOptions,
  LinkInputProps,
  LinkReferenceValue,
  LinkSchemaType,
  LinkValue,
} from './types'
