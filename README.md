# sanity-plugin-link-picker
<img width="800" height="521" alt="CleanShot 2026-06-29 at 12 10 51" src="https://github.com/user-attachments/assets/315ca49c-af57-4040-b838-b9272a2eade6" />

A small Sanity Studio link field for choosing a label, a URL, and optionally a weak reference, inspired by Shopify's link picker.

It registers a single `link` object type with two built-in fields:

- `label` - editor-facing link text, like `Shop now`
- `url` - a path, query string, hash, URL, email address, or phone number

When document routes are configured, it also adds:

- `reference` - a weak Sanity reference for internal links

The plugin stays intentionally unopinionated. It stores the link data, then lets your GROQ projection and frontend decide how references turn into URLs.

On the Studio side, the input prevents invalid URL values. When `url` is present, it is already normalized as a valid internal path, query string, hash, external URL, `mailto:`, or `tel:` link.

## Why this design

Most link solutions fall into one of two camps. This plugin avoids both.

**vs. one object type per target** (`pageLink`, `productLink`, `collectionLink`, …)

- One `link` type instead of N: a new linkable document is a new route, not a new schema object + GROQ fragment + frontend `_type` branch.
- The stored shape is always `{label, url, reference}`, so changing how a reference resolves is a query edit, not a schema migration.

**vs. an internal/external mode toggle** (a `linkType` field with conditionally hidden `reference`/`url` inputs, as in [`@sanity/presets`](https://github.com/sanity-io/plugins/tree/main/plugins/%40sanity/presets) `defineLink` and [`sanity-plugin-link-field`](https://github.com/winteragency/sanity-plugin-link-field))

- No mode to pick first: one search box resolves references, paths, URLs, `mailto:`, `tel:`, hashes, and query strings.
- No discriminator to branch on in GROQ, and no stale value left behind in the hidden half of the form.
- `url` accepts relative paths and bare `?query`/`#hash`, not just `http`/`https`/`mailto`/`tel`.

Either way you get validation at edit time and a uniform `{label, url}` on the frontend instead of switching on `_type`. Already on one of these schemas? See [Migrating From Custom Link Types](#migrating-from-custom-link-types).

## Installation

```sh
npm install sanity-plugin-link-picker
```

## Usage

Add the plugin to `sanity.config.ts`:

```ts
import {defineConfig} from 'sanity'
import {linkPicker} from 'sanity-plugin-link-picker'

export default defineConfig({
  // ...
  plugins: [linkPicker()],
})
```

Use the `link` type anywhere in your schema:

```ts
import {defineField, defineType} from 'sanity'

export const hero = defineType({
  name: 'hero',
  title: 'Hero',
  type: 'object',
  fields: [
    defineField({
      name: 'link',
      title: 'Link',
      type: 'link',
    }),
  ],
})
```

## Stored Value

A saved link value looks like this:

```ts
type LinkValue = {
  _type?: 'link'
  label?: string | null
  url?: string | null
  reference?: {
    _type: 'reference'
    _ref: string
    _weak?: boolean
  } | null
}
```

For external links, paths, emails, phone numbers, hashes, and query strings, the value is stored in `url`.

For internal document links, configure document routes first. Those links are stored in `reference`.

## Querying Links

Project the fields your frontend needs. The plugin does not assume what an internal URL should look like.

```groq
*[_type == "page" && slug.current == $slug][0] {
  title,
  link {
    label,
    url,
    reference->{
      _type,
      slug
    }
  }
}
```

Then resolve the href in your app:

```ts
type ProjectedLink = {
  label?: string | null
  url?: string | null
  reference?: {
    _type?: string
    slug?: {current?: string}
  } | null
}

function resolveLink(link?: ProjectedLink) {
  if (!link) return null
  if (link.url) return link.url

  if (link.reference?._type === 'page' && link.reference.slug?.current) {
    return `/${link.reference.slug.current}`
  }

  return null
}
```

Or resolve the final URL directly in GROQ if your route rules are simple:

```groq
*[_type == "page" && slug.current == $slug][0] {
  title,
  link {
    label,
    "url": coalesce(
      select(
        reference->_type == "product" => "/products/" + reference->store.slug.current,
        reference->_type == "collection" => "/collections/" + reference->slug.current
      ),
      url
    )
  }
}
```

That keeps the frontend shape as `{label, url}`. Reference URLs are inferred first, and the stored `url` field is used as the fallback.

## Link Picker Routes

The field works without configuration for labels and URL values. Add routes when you want the picker to offer shortcuts or browseable document folders.

```ts
import {defineConfig} from 'sanity'
import {linkPicker, route, documents} from 'sanity-plugin-link-picker'

export default defineConfig({
  // ...
  plugins: [
    linkPicker([
      route('Home', '/'),
      route('Shop', '/shop'),
      documents('Pages', 'page'),
      documents('Products', 'product'),
    ]),
  ],
})
```

You can also override routes on a single field. Field-level overrides can narrow or customize the picker, but document routes still need to be declared at the plugin level so Sanity can define accepted reference types.

```ts
defineField({
  name: 'link',
  title: 'Link',
  type: 'link',
  options: {
    routes: [
      route('Contact', '/contact'),
      documents('Products', 'product'),
    ],
  },
})
```

Document routes control which reference types the picker can select. Static routes write to `url`; document selections write to `reference`.

## Extending the Field

If your project needs extra fields, append them at the plugin level. You can also configure the Sanity preview for the `link` object with `preview`:

```ts
import {defineField} from 'sanity'

linkPicker(
  [
    route('Home', '/'),
    documents('Pages', 'page'),
  ],
  {
    fields: [
      defineField({
        name: 'parameters',
        title: 'Parameters',
        type: 'string',
      }),
      defineField({
        name: 'anchor',
        title: 'Anchor',
        type: 'string',
      }),
    ],
    preview: {
      select: {
        title: 'label',
        subtitle: 'url',
      },
    },
  },
)
```

Keep the default fields stable when possible. Most projects can model extra frontend behavior in GROQ or in their link resolver without changing the stored shape.

## Migrating From Custom Link Types

A common pattern this plugin replaces is the "polymorphic CTA array": a field whose items can be one of several hand-rolled link object types, for example `link`, `pageLink`, `productLink`, and `collectionLink`. Each variant typically carries its own `title`, its own reference, and its own frontend URL rules.

With this plugin you can collapse all of those into a single `link` type. A CTA list becomes a plain array of `link`, and the URL rules move out of the schema and into your GROQ projection or link resolver.

```ts
// Before: an array of four bespoke object types
defineField({
  name: 'ctaList',
  type: 'array',
  of: [
    {type: 'link'}, // local generic url object
    {type: 'pageLink'},
    {type: 'productLink'},
    {type: 'collectionLink'},
  ],
})

// After: a plain array of the plugin's link type
defineField({
  name: 'ctaList',
  type: 'array',
  of: [{type: 'link'}],
  // a single CTA is just the same array with a max
  // validation: (rule) => rule.max(1),
})
```

### Field mapping

| Old shape                                            | Plugin field | Notes                                                                                 |
| ---------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| `title`                                              | `label`      | Editor-facing text.                                                                   |
| `link.url`                                           | `url`        | External URLs, paths, `mailto:`, `tel:`, hashes, query strings.                       |
| `pageLink` / `productLink` / `collectionLink` ref    | `reference`  | Keep the same `_ref`; the URL is resolved in GROQ from the referenced document.        |

The plugin intentionally stores only `{label, url, reference}`. Anything URL-shaped lives in `url`; anything internal lives in `reference`. Your frontend decides what a reference becomes.

### Migrating the content

Changing the schema does **not** rewrite existing documents. Existing array items still have their old `_type` (`pageLink`, `productLink`, etc.) and old field names, so they won't validate against the new `link`-only array until you migrate them.

The key insight: the `_type` of an object **inside an array** is mutable (only a _document's_ `_id` and `_type` are immutable). That means a single content migration can rewrite each old variant into a plugin `link` in place.

Scaffold a migration with `sanity migration create`, then adapt this:

```ts
// migrations/collapse-cta-links/index.ts
import {defineMigration, set} from 'sanity/migrate'

const OLD_LINK_TYPES = ['link', 'pageLink', 'productLink', 'collectionLink']

export default defineMigration({
  title: 'Collapse custom CTA link types into the plugin link type',
  // Limit to the documents that actually use ctaList / cta.
  // documentTypes: ['page', 'productLanding', 'collection'],
  migrate: {
    object(node, path, context) {
      if (!OLD_LINK_TYPES.includes(node._type as string)) return

      // Skip items that already look like the new plugin shape.
      if (node._type === 'link' && 'label' in node) return

      const next: Record<string, unknown> = {
        _type: 'link',
        _key: node._key, // preserve the array key
      }

      // title -> label
      if (node.title) next.label = node.title

      // plain url variant
      if (node.url) next.url = node.url

      // internal variants -> reference.
      // Adjust the source field name(s) to match your old schema
      // (e.g. `reference`, `page`, `product`, `collection`).
      const ref =
        (node.reference as any) ??
        (node.page as any) ??
        (node.product as any) ??
        (node.collection as any)

      if (ref?._ref) {
        next.reference = {_type: 'reference', _ref: ref._ref, _weak: true}
      }

      return set(next)
    },
  },
})
```

This migration is idempotent: the `'label' in node` guard means re-running it leaves already-migrated links untouched.

Always back up first and dry-run before committing:

```sh
# back up the dataset
npx sanity dataset export

# dry run (default) – review the patches
npx sanity migration run collapse-cta-links

# apply for real
npx sanity migration run collapse-cta-links --no-dry-run
```

### Resolving the URL on the frontend

Because the URL rules left the schema, resolve them in GROQ. References become paths by `_type`, and the stored `url` is used as the fallback:

```groq
ctaList[] {
  _type,
  label,
  "url": coalesce(
    select(
      reference->_type == "productLanding" => "/products/" + reference->slug.current,
      reference->_type == "collection"     => "/collections/" + reference->slug.current,
      defined(reference)                   => "/" + reference->slug.current
    ),
    url
  )
}
```

That gives every CTA the same `{label, url}` shape on the frontend, so your `<Link>` component no longer needs to branch on `pageLink` / `productLink` / `collectionLink`.

For the full workflow (validating documents, staging datasets, defensive code, rate limits), see Sanity's [schema and content migrations guide](https://www.sanity.io/docs/content-lake/schema-and-content-migrations) and the [content migration cheat sheet](https://www.sanity.io/docs/content-lake/content-migration-cheatsheet).

## API

```ts
import {
  defineLinkMenu,
  documents,
  group,
  linkPicker,
  route,
  type LinkFieldOptions,
  type LinkFieldPluginOptions,
  type LinkRouteDefinition,
  type LinkValue,
} from 'sanity-plugin-link-picker'
```

Upgrading from `sanity-plugin-link` or an earlier `linkPlugin` / `linkRoute` API? See [MIGRATION.md](./MIGRATION.md).

## License

[MIT](LICENSE) © Dennis Regalado
