# sanity-plugin-link
<img width="800" height="521" alt="CleanShot 2026-06-29 at 12 10 51" src="https://github.com/user-attachments/assets/315ca49c-af57-4040-b838-b9272a2eade6" />

A small Sanity Studio link field for choosing a label, a URL, and optionally a weak reference, inspired by Shopify's link picker.

It registers a single `link` object type with two built-in fields:

- `label` - editor-facing link text, like `Shop now`
- `url` - a path, query string, hash, URL, email address, or phone number

When document routes are configured, it also adds:

- `reference` - a weak Sanity reference for internal links

The plugin stays intentionally unopinionated. It stores the link data, then lets your GROQ projection and frontend decide how references turn into URLs.

On the Studio side, the input prevents invalid URL values. When `url` is present, it is already normalized as a valid internal path, query string, hash, external URL, `mailto:`, or `tel:` link.

## Installation

```sh
npm install sanity-plugin-link
```

## Usage

Add the plugin to `sanity.config.ts`:

```ts
import {defineConfig} from 'sanity'
import {linkPlugin} from 'sanity-plugin-link'

export default defineConfig({
  // ...
  plugins: [linkPlugin()],
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
import {linkPlugin, linkRoute} from 'sanity-plugin-link'

export default defineConfig({
  // ...
  plugins: [
    linkPlugin({
      routes: [
        linkRoute.route('Home', '/'),
        linkRoute.route('Shop', '/shop'),
        linkRoute.documents('Pages', 'page'),
        linkRoute.documents('Products', 'product'),
      ],
    }),
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
      linkRoute.route('Contact', '/contact'),
      linkRoute.documents('Products', 'product'),
    ],
  },
})
```

Document routes control which reference types the picker can select. Static routes write to `url`; document selections write to `reference`.

## Extending the Field

If your project needs extra fields, append them at the plugin level. You can also configure the Sanity preview for the `link` object with `preview`:

```ts
import {defineField} from 'sanity'

linkPlugin({
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
})
```

Keep the default fields stable when possible. Most projects can model extra frontend behavior in GROQ or in their link resolver without changing the stored shape.

## API

```ts
import {
  defineLinkMenu,
  linkPlugin,
  linkRoute,
  type LinkFieldOptions,
  type LinkFieldPluginOptions,
  type LinkRouteDefinition,
  type LinkValue,
} from 'sanity-plugin-link'
```

## License

[MIT](LICENSE) © Dennis Regalado
# sanity-plugin-link
