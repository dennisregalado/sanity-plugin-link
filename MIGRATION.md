# Migrating to `sanity-plugin-link-picker` 1.1

This covers the package rename and the 1.1 API changes. Stored document values (`label`, `url`, `reference`) are unchanged — only Studio config and imports need updates.

## 1. Install the new package

```sh
npm uninstall sanity-plugin-link
npm install sanity-plugin-link-picker
```

## 2. Update imports

```diff
- import {linkPlugin, linkRoute} from 'sanity-plugin-link'
+ import {linkPicker, route, documents, group} from 'sanity-plugin-link-picker'
```

## 3. Rename the plugin

```diff
- plugins: [linkPlugin(/* ... */)],
+ plugins: [linkPicker(/* ... */)],
```

## 4. Pass routes as the first argument

**Before (options object):**

```ts
linkPlugin({
  routes: [
    linkRoute.route('Home', '/'),
    linkRoute.route('Shop', '/shop'),
    linkRoute.documents('Pages', 'page'),
    linkRoute.documents('Products', 'product'),
  ],
  fields: [
    defineField({name: 'parameters', type: 'string'}),
  ],
})
```

**After (routes first, options second):**

```ts
linkPicker(
  [
    route('Home', '/'),
    route('Shop', '/shop'),
    documents('Pages', 'page'),
    documents('Products', 'product'),
  ],
  {
    fields: [
      defineField({name: 'parameters', type: 'string'}),
    ],
  },
)
```

Routes only:

```ts
linkPicker([
  route('Home', '/'),
  documents('Pages', 'page'),
])
```

No config:

```ts
linkPicker()
```

## 5. Flatten route helpers

| Before | After |
| --- | --- |
| `linkRoute.route(title, path)` | `route(title, path)` |
| `linkRoute.documents(title, type)` | `documents(title, type)` |
| `linkRoute.group(title, routes)` | `group(title, routes)` |

Field-level overrides still use `options.routes`:

```ts
defineField({
  name: 'link',
  type: 'link',
  options: {
    routes: [
      route('Contact', '/contact'),
      documents('Products', 'product'),
    ],
  },
})
```

## Checklist

- [ ] Swap the npm package
- [ ] Replace `linkPlugin` with `linkPicker`
- [ ] Move `routes` out of the options object into the first argument
- [ ] Replace `linkRoute.*` with `route` / `documents` / `group`
- [ ] Restart Studio and smoke-test the link picker
