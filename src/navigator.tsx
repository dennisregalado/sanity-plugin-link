/**
 * Shopify-style link picker for Sanity fields.
 *
 * Groups render section labels, routes select URL values immediately, and
 * document folders drill into Sanity query results to select references.
 */

import {
  ChevronRightIcon,
  ChevronLeftIcon,
} from '@sanity/icons';
import {
  Box,
  Button,
  Flex,
  Stack,
  Text,
} from '@sanity/ui';
import { AtSignIcon, GlobeIcon, LinkIcon, PhoneIcon, type LucideIcon } from 'lucide-react';
import React, {
  useMemo,
  useState,
  createContext,
  useContext,
} from 'react';
import { useListeningQuery } from 'sanity-plugin-utils';
import {
  SanityDocument,
  SanityDefaultPreview,
  SearchResultItemPreview,
  type QueryParams,
  usePerspective,
  useSchema,
} from 'sanity';

const DefaultIcon = () => <Text>✨</Text>;
const NAVIGATOR_MAX_HEIGHT = 390;
const ICON_SIZE = 16;

type LinkIcon = () => React.ReactNode;
type LinkIconInput = React.ElementType | React.ReactNode | string;
type SystemLinkType = 'internal' | 'external' | 'email' | 'phone';

const defaultLinkTypeIcons: Record<SystemLinkType, LucideIcon> = {
  internal: LinkIcon,
  external: GlobeIcon,
  email: AtSignIcon,
  phone: PhoneIcon,
};

type FolderRow =
  | { type: 'back' }
  | { type: 'document'; document: SanityDocument }
  | { type: 'empty' }
  | { type: 'skeleton'; index: number };

type SearchRow =
  | { type: 'header'; label: string }
  | { type: 'result'; item: SearchResultItem }
  | { type: 'empty' }
  | { type: 'skeleton'; index: number };

type SearchResultItem =
  | {
    type: 'document';
    document: SearchDocument;
  }
  | {
    type: 'link' | 'route';
    label?: string;
    title?: string;
    href: string;
    icon?: () => React.ReactNode;
  };

type SearchDocument = SanityDocument & {
  label?: string;
  title?: string;
  _id: string;
  _type: string;
};

export type StaticLinkRoute = {
  type: 'route';
  title: string;
  path: string;
  icon?: LinkIconInput;
};

export type LinkRouteGroup = {
  type: 'group';
  title: string;
  icon?: LinkIconInput;
  routes: LinkRouteDefinition[];
};

export type LinkDocumentFolder = {
  type: 'documents';
  title: string;
  documentType: string;
  icon?: LinkIconInput;
  filter?: string;
  filterParams?: QueryParams;
};

export type LinkRouteDefinition =
  | StaticLinkRoute
  | LinkRouteGroup
  | LinkDocumentFolder;

export type LinksPluginProps = {
  routes: LinkRouteDefinition[];
};

export function defineLinkMenu(routes: LinkRouteDefinition[]): LinksPluginProps {
  const config = { routes };
  validateLinksConfig(config);
  return config;
}

export function getFlattenedLinkRoutes(
  routes: LinkRouteDefinition[],
): StaticLinkRoute[] {
  const result: StaticLinkRoute[] = [];

  for (const route of routes) {
    if (route.type === 'group') {
      result.push(...getFlattenedLinkRoutes(route.routes));
    } else if (route.type === 'route') {
      result.push(route);
    }
  }

  return result;
}

export function getReferenceTypesFromRoutes(
  routes: LinkRouteDefinition[],
): string[] {
  const documentTypes = new Set<string>();

  for (const route of routes) {
    if (route.type === 'group') {
      for (const type of getReferenceTypesFromRoutes(route.routes)) {
        documentTypes.add(type);
      }
    }

    if (route.type === 'documents') {
      documentTypes.add(route.documentType);
    }
  }

  return Array.from(documentTypes);
}

export function getReferenceTypesFromSchemaType(
  schemaType: unknown,
  fieldName = 'reference',
): string[] {
  const fields = (schemaType as any)?.fields;
  const referenceField = Array.isArray(fields)
    ? fields.find((field) => field?.name === fieldName)
    : undefined;
  const to = referenceField?.type?.to || referenceField?.to;

  if (!Array.isArray(to)) {
    return [];
  }

  return to
    .map((target) => target?.name || target?.type)
    .filter((type): type is string => typeof type === 'string');
}

export function normalizeLinkHref(value: string | null | undefined): string | null {
  const input = value?.trim();

  if (!input) {
    return null;
  }

  if (input.startsWith('/') || input.startsWith('#') || input.startsWith('?')) {
    return input;
  }

  if (/^mailto:/i.test(input)) {
    const email = input.slice('mailto:'.length).trim();
    return isEmailAddress(email) ? `mailto:${email}` : null;
  }

  if (isEmailAddress(input)) {
    return `mailto:${input}`;
  }

  if (/^tel:/i.test(input)) {
    const phone = normalizePhoneNumber(input.slice('tel:'.length));
    return phone ? `tel:${phone}` : null;
  }

  const phone = normalizePhoneNumber(input);
  if (phone) {
    return `tel:${phone}`;
  }

  if (/^https?:\/\//i.test(input)) {
    return isAbsoluteUrl(input) ? input : null;
  }

  if (looksLikeDomain(input)) {
    return `https://${input}`;
  }

  return null;
}

export function isInternalLinkHref(value: string | null | undefined) {
  return Boolean(value?.startsWith('/') || value?.startsWith('#') || value?.startsWith('?'));
}

export const linkRoute = {
  route(
    title: string,
    path: string,
    options?: Omit<StaticLinkRoute, 'type' | 'title' | 'path'>,
  ): StaticLinkRoute {
    return { type: 'route', title, path, ...options };
  },
  group(
    title: string,
    routes: LinkRouteDefinition[],
    options?: Omit<LinkRouteGroup, 'type' | 'title' | 'routes'>,
  ): LinkRouteGroup {
    return {
      type: 'group',
      title,
      routes,
      ...options,
    };
  },
  documents(
    title: string,
    documentType: string,
    options?: Omit<LinkDocumentFolder, 'type' | 'title' | 'documentType'>,
  ): LinkDocumentFolder {
    return {
      type: 'documents',
      title,
      documentType,
      ...options,
    };
  },
};

// Type definitions
type NavigatorProps = {
  onSelect?: (item: {
    label?: string;
    href?: string;
    reference?: string;
    _type?: string;
    _id?: string;
  }) => void;
  onClose?: () => void;
  routes?: LinkRouteDefinition[];
  referenceTypes?: string[];
  searchQuery?: string;
};

type MenuItem = {
  label?: string; // Display name in UI
  href?: string; // Navigation URL for 'page' type items
  type?: string; // 'page' | 'folder' | 'group'
  icon?: () => React.ReactNode; // Icon component (emoji-based)
  children?: MenuItem[]; // Nested items for 'group' type  
  omitLabelOnSelect?: boolean;
  documentType?: string;
  filter?: string;
  filterParams?: QueryParams;
};

function NormalizedLinkIcon({
  children,
  shift = false,
}: {
  children: React.ReactNode;
  shift?: boolean;
}) {
  return (
    <span
      style={{
        alignItems: 'center',
        display: 'inline-flex',
        height: 20,
        justifyContent: 'center',
        lineHeight: 0,
        transform: shift ? 'translate(-3px, -1px)' : undefined,
        verticalAlign: 'middle',
        width: 20,
      }}
    >
      <span
        style={{
          alignItems: 'center',
          display: 'inline-flex',
          fontSize: 16,
          justifyContent: 'center',
          lineHeight: 1,
        }}
      >
        {children}
      </span>
    </span>
  );
}

export function normalizeLinkIcon(
  icon: LinkIconInput | undefined,
  options?: {shift?: boolean},
): LinkIcon | undefined {
  if (!icon) {
    return undefined;
  }

  if (typeof icon === 'function' || isReactComponentObject(icon)) {
    return () => (
      <NormalizedLinkIcon shift={options?.shift}>
        {React.createElement(icon as React.ElementType)}
      </NormalizedLinkIcon>
    );
  }

  return () =>
    (
      <NormalizedLinkIcon shift={options?.shift}>
        {typeof icon === 'string' ? <Text>{icon}</Text> : (icon as React.ReactNode)}
      </NormalizedLinkIcon>
    );
}

function isReactComponentObject(icon: unknown): icon is React.ElementType {
  return Boolean(
    icon
    && typeof icon === 'object'
    && '$$typeof' in icon
    && !React.isValidElement(icon),
  );
}

function getSystemLinkType(href: string): SystemLinkType {
  if (href.startsWith('mailto:')) {
    return 'email';
  }

  if (href.startsWith('tel:')) {
    return 'phone';
  }

  return isInternalLinkHref(href) ? 'internal' : 'external';
}

export function getSystemLinkIcon(href: string, options?: {shift?: boolean}): LinkIcon {
  const Icon = defaultLinkTypeIcons[getSystemLinkType(href)];

  return () => (
    <NormalizedLinkIcon shift={options?.shift}>
      <Icon size={ICON_SIZE} />
    </NormalizedLinkIcon>
  );
}

function isEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePhoneNumber(value: string) {
  const trimmed = value.trim();

  if (!/^\+?[\d\s().-]+$/.test(trimmed)) {
    return null;
  }

  const digits = trimmed.replace(/\D/g, '');

  if (digits.length < (trimmed.startsWith('+') ? 7 : 10)) {
    return null;
  }

  return `${trimmed.startsWith('+') ? '+' : ''}${digits}`;
}

function isAbsoluteUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function looksLikeDomain(value: string) {
  if (/\s/.test(value) || value.includes('@')) {
    return false;
  }

  return /^(?:[a-z0-9-]+\.)+[a-z]{2,63}(?::\d+)?(?:[/?#].*)?$/i.test(value);
}

function getTypedLinkResult(query: string): SearchResultItem | null {
  const href = normalizeLinkHref(query);

  if (!href || href === query) {
    return null;
  }

  return {
    type: 'link',
    href,
    icon: getSystemLinkIcon(href),
    label: href,
    title: href,
  };
}

function applyReferenceTypes(
  routes: LinkRouteDefinition[],
  referenceTypes?: string[],
): LinkRouteDefinition[] {
  if (!referenceTypes?.length) {
    return routes;
  }

  return routes
    .map((route) => {
      if (route.type === 'group') {
        return {
          ...route,
          routes: applyReferenceTypes(route.routes, referenceTypes),
        };
      }

      return route;
    })
    .filter((route) => {
      if (route.type !== 'documents') {
        return true;
      }

      return referenceTypes.includes(route.documentType);
    });
}

function validateLinksConfig(config: LinksPluginProps) {
  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
  if (nodeEnv === 'production') {
    return;
  }

  for (const warning of getLinkConfigWarnings(config.routes)) {
    console.warn(`[sanity-plugin-links] ${warning}`);
  }
}

function getLinkConfigWarnings(routes: LinkRouteDefinition[], path: string[] = []): string[] {
  const warnings: string[] = [];

  for (const route of routes) {
    const label = route.title;
    const nextPath = [...path, label];

    if (route.type === 'route' && !route.path.startsWith('/')) {
      warnings.push(`${nextPath.join(' > ')} path should start with "/".`);
    }

    if (route.type === 'group') {
      warnings.push(...getLinkConfigWarnings(route.routes, nextPath));
    }
  }

  return warnings;
}

function normalizeRoutes(routes: LinkRouteDefinition[]): MenuItem[] {
  return routes.map((route) => {
    switch (route.type) {
      case 'route':
        return {
          label: route.title,
          href: route.path,
          type: 'page',
          icon: normalizeLinkIcon(route.icon),
        };
      case 'group':
        return {
          label: route.title,
          type: 'group',
          icon: normalizeLinkIcon(route.icon),
          children: normalizeRoutes(route.routes),
        };
      case 'documents':
        return {
          label: route.title,
          type: 'folder',
          icon: normalizeLinkIcon(route.icon),
          documentType: route.documentType,
          filter: route.filter,
          filterParams: route.filterParams,
        };
      default:
        throw new Error(`Unsupported link route: ${JSON.stringify(route)}`);
    }
  });
}

function createDocumentFolderQuery(filter?: string) {
  const filterQuery = filter ? ` && (${filter})` : '';

  return `*[_type == $type${filterQuery}] {
    _id,
    _type,
    _createdAt,
    _updatedAt, 
    'label': coalesce(title, name, slug.current, _id),
    'title': coalesce(title, name, slug.current, _id)
  }`;
}

/**
 * NAVIGATION CONTEXT SYSTEM
 * =========================
 *
 * Manages the hierarchical navigation state using React Context.
 * Maintains a stack of folders to enable breadcrumb-style navigation.
 *
 * Navigation Flow:
 * - Root: navigationStack is empty, shows main menu
 * - Folder: pushFolder() adds to stack, shows folder contents
 * - Back: popFolder() removes last item, goes up one level
 */
type NavigationContextType = {
  navigationStack: MenuItem[]; // Array of navigation history
  pushFolder: (folder: MenuItem) => void; // Navigate into a folder
  popFolder: () => void; // Go back one level
  onSelect?: (item: {
    label?: string;
    href?: string;
    reference?: string;
    _type?: string;
    _id?: string;
  }) => void;
  onClose?: () => void;
};

const NavigationContext = createContext<NavigationContextType | null>(null);

function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }
  return context;
}

function NavigationProvider({
  children,
  onClose,
  onSelect,
}: {
  children: React.ReactNode;
  onClose?: () => void;
  onSelect?: (item: {
    label?: string;
    href?: string;
    reference?: string;
    _type?: string;
    _id?: string;
  }) => void;
}) {
  const [navigationStack, setNavigationStack] = useState<MenuItem[]>([]);

  const pushFolder = (folder: MenuItem) => {
    setNavigationStack((prev) => [...prev, folder]);
  };

  const popFolder = () => {
    setNavigationStack((prev) => prev.slice(0, -1));
  };

  return (
    <NavigationContext.Provider
      value={{ navigationStack, pushFolder, popFolder, onSelect, onClose }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function VisualEditorNavigator({
  onClose,
  onSelect,
  routes,
  referenceTypes,
  searchQuery,
}: NavigatorProps) {

  const filteredRoutes = useMemo(
    () => applyReferenceTypes(routes || [], referenceTypes),
    [routes, referenceTypes],
  );
  const menuItems = useMemo(
    () => normalizeRoutes(filteredRoutes),
    [filteredRoutes],
  );
  const documentTypes = useMemo(
    () => getReferenceTypesFromRoutes(filteredRoutes),
    [filteredRoutes],
  );
  const staticRoutes = useMemo(
    () => getFlattenedLinkRoutes(filteredRoutes),
    [filteredRoutes],
  );

  return (
    <NavigationProvider onClose={onClose} onSelect={onSelect}>
      <NavigatorContent
        documentTypes={documentTypes}
        menuItems={menuItems}
        searchQuery={searchQuery}
        staticRoutes={staticRoutes}
      />
    </NavigationProvider>
  );
}

function NavigatorContent({
  documentTypes,
  menuItems: propMenuItems,
  searchQuery,
  staticRoutes,
}: {
  documentTypes: string[];
  menuItems: MenuItem[];
  searchQuery?: string;
  staticRoutes: StaticLinkRoute[];
}) {
  const { navigationStack } = useNavigation();
  const currentFolder = navigationStack[navigationStack.length - 1];
  const trimmedSearchQuery = searchQuery?.trim() || '';

  return (
    <div
      style={{
        height: 'min-content',
        maxHeight: NAVIGATOR_MAX_HEIGHT,
        overflow: 'hidden',
      }}
    >
      {trimmedSearchQuery ? (
        <SearchResults
          documentTypes={documentTypes}
          query={trimmedSearchQuery}
          staticRoutes={staticRoutes}
        />
      ) : currentFolder ? (
        <Folder item={currentFolder} />
      ) : (
        <PageMenu menuItems={propMenuItems} />
      )}
    </div>
  );
}

function SearchResults({
  documentTypes,
  query,
  staticRoutes,
}: {
  documentTypes: string[];
  query: string;
  staticRoutes: StaticLinkRoute[];
}) {
  const perspective = usePerspective();
  const searchPattern = `*${query}*`;
  const typedLinkResult = useMemo(() => getTypedLinkResult(query), [query]);
  const staticResults = useMemo(
    () => staticRoutes
      .filter((route) =>
        `${route.title} ${route.path}`.toLowerCase().includes(query.toLowerCase()),
      )
      .map<SearchResultItem>((route) => ({
        type: 'route',
        href: route.path,
        icon: normalizeLinkIcon(route.icon),
        label: route.title,
        title: route.title,
      })),
    [query, staticRoutes],
  );
  const shouldSearchDocuments = documentTypes.length > 0;
  const { data, loading } = shouldSearchDocuments
    ? useListeningQuery<SearchDocument[]>(
      `*[_type in $types && (
        title match $query ||
        name match $query ||
        slug.current match $query
      )][0...1000] {
        _id,
        _type,
        _createdAt,
        _updatedAt,
        'label': coalesce(title, name, slug.current, _id),
        'title': coalesce(title, name, slug.current, _id)
      }`,
      {
        params: {
          query: searchPattern,
          types: documentTypes,
        },
        options: {
          perspective: (perspective.selectedPerspective || 'drafts') as any,
        },
      },
    )
    : { data: null, loading: false };
  const documentResults = Array.isArray(data) ? data : [];
  const results = useMemo(
    () => [
      ...(typedLinkResult ? [typedLinkResult] : []),
      ...staticResults,
      ...documentResults.map<SearchResultItem>((document) => ({
        type: 'document',
        document,
      })),
    ],
    [documentResults, staticResults, typedLinkResult],
  );
  const resultLabel = `${results.length} ${results.length === 1 ? 'result' : 'results'}`;
  const rows = useMemo<SearchRow[]>(() => {
    const headerRow: SearchRow = {
      type: 'header',
      label: loading ? 'Searching...' : resultLabel,
    };

    if (loading) {
      return [
        headerRow,
        ...Array.from({ length: 10 }, (_, index) => ({
          type: 'skeleton' as const,
          index,
        })),
      ];
    }

    if (results.length === 0) {
      return [headerRow, { type: 'empty' }];
    }

    return [
      headerRow,
      ...results.map((item) => ({ type: 'result' as const, item })),
    ];
  }, [loading, resultLabel, results]);

  return (
    <Flex gap={1} justify="flex-start" direction="column">
      <ScrollableList
        getKey={(row, index) => {
          if (row.type === 'header') return 'header';
          if (row.type === 'empty') return 'empty';
          if (row.type === 'skeleton') return `skeleton-${row.index}`;
          return row.item.type === 'document'
            ? row.item.document._id
            : row.item.href || index;
        }}
        items={rows}
        maxHeight={NAVIGATOR_MAX_HEIGHT}
        renderItem={(row) => {
          if (row.type === 'header') {
            return (
              <Box paddingX={2} paddingY={3}>
                <Flex align="center" justify="space-between" style={{ width: '100%' }}>
                  <Text size={1} weight="medium">
                    {row.label}
                  </Text>
                </Flex>
              </Box>
            );
          }

          if (row.type === 'skeleton') {
            return <SkeletonItem />;
          }

          if (row.type === 'empty') {
            return <EmptyFolderState />;
          }

          return <SearchResult item={row.item} perspectiveStack={perspective.perspectiveStack} />;
        }}
      />
    </Flex>
  );
}

function SearchResult({
  item,
  perspectiveStack,
}: {
  item: SearchResultItem;
  perspectiveStack?: string[];
}) {
  if (item.type === 'document') {
    return (
      <DocumentItem
        icon={DefaultIcon}
        item={item.document}
        perspectiveStack={perspectiveStack}
      />
    );
  }

  return (
    <PageItem
      item={{
        href: item.href,
        icon: item.icon,
        label: item.label || item.title,
        omitLabelOnSelect: item.type === 'link',
        type: 'page',
      }}
    />
  );
}

function PageMenu({
  menuItems,
}: {
  menuItems: MenuItem[];
}) {
  return (
    <Flex 
      gap={1}
      justify="flex-start"
      direction="column" 
    >
      <ScrollableList
        getKey={(item, index) => item.href || item.label || index}
        items={menuItems}
        maxHeight={NAVIGATOR_MAX_HEIGHT}
        renderItem={(item) => {
          return <MenuItemRow item={item} />;
        }}
      />
    </Flex>
  );
}

function Group({ item }: { item: MenuItem }) {
  return (
    <Stack>
      <Box paddingX={2} paddingTop={3} paddingBottom={2}>
        <Text size={1} weight="medium">
          {item.label}
        </Text>
      </Box>
      {item.children?.map((child, index) => (
        <MenuItemRow key={child.href || child.label || index} item={child} />
      ))}
    </Stack>
  );
}

function MenuItemRow({ item }: { item: MenuItem }) {
  const { pushFolder } = useNavigation();

  if (item.type === 'folder') {
    return (
      <Button
        mode="bleed"
        padding={1}
        onClick={() => pushFolder(item)}
        width="fill"
      >
        <Flex style={{ width: '100%' }} align="center" justify="space-between" gap={3}>
          <Box flex={1}>
            <SanityDefaultPreview
              layout="compact"
              title={item.label}
              media={item.icon}
              icon={item.icon ? undefined : false}
            />
          </Box>
          <ChevronRightIcon />
        </Flex>
      </Button>
    );
  }

  if (item.type === 'group') {
    return <Group item={item} />;
  }

  return <PageItem item={item} />;
}

function Folder({
  item,
}: {
  item: MenuItem;
}) {
  const { popFolder } = useNavigation();

  const perspective = usePerspective();
  const query = useMemo(
    () => item.documentType ? createDocumentFolderQuery(item.filter) : '',
    [item.documentType, item.filter],
  );
  const params = useMemo(
    () => {
      const nextParams: QueryParams = {
        ...(item.filterParams || {}),
      };

      if (item.documentType) {
        nextParams.type = item.documentType;
      }

      return nextParams;
    },
    [item.documentType, item.filterParams],
  );

  const { data, loading } = item.documentType
    ? useListeningQuery<SanityDocument[]>(query, {
      params,
      options: {
        perspective: (perspective.selectedPerspective || 'drafts') as any,
      },
    })
    : { data: null, loading: false };

  const skeletonRowCount = 10;

  const items: SanityDocument[] = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];

    const typedData = data as SanityDocument[];

    return typedData;
  }, [data]);

  const rows = useMemo<FolderRow[]>(() => {
    const backRow: FolderRow = { type: 'back' };

    if (loading) {
      return [
        backRow,
        ...Array.from({ length: skeletonRowCount }, (_, index) => ({
          type: 'skeleton' as const,
          index,
        })),
      ];
    }

    if (item.documentType && items.length === 0) {
      return [backRow, { type: 'empty' }];
    }

    return [
      backRow,
      ...items.map((document) => ({
        type: 'document' as const,
        document,
      })),
    ];
  }, [item.documentType, items, loading]);
  const resultCount = items.length;
  const resultLabel = `${resultCount} ${resultCount === 1 ? 'result' : 'results'}`;

  return (
    <Flex 
      gap={1}
      justify="flex-start"
      direction="column"
    >
      <ScrollableList
        getKey={(row, index) => {
          if (row.type === 'back') return 'back';
          if (row.type === 'empty') return 'empty';
          if (row.type === 'skeleton') return `skeleton-${row.index}`;
          return `${row.document._id || 'document'}-${index}`;
        }}
        items={rows}
        maxHeight={NAVIGATOR_MAX_HEIGHT}
        renderItem={(row) => {
          if (row.type === 'back') {
            return (
              <Button
                mode="bleed"
                paddingX={2}
                paddingY={3}
                width="fill"
                onClick={popFolder}
              >
                <Flex align="center" justify="space-between" style={{ width: '100%' }}>
                  <Flex align="center" gap={3}>
                    <ChevronLeftIcon />
                    <Text size={1} weight="medium">
                      Back
                    </Text>
                  </Flex>
                  {!loading ? (
                    <Text muted size={1} weight="medium">
                      {resultLabel}
                    </Text>
                  ) : null}
                </Flex>
              </Button>
            );
          }

          if (row.type === 'skeleton') {
            return <SkeletonItem />;
          }

          if (row.type === 'empty') {
            return <EmptyFolderState />;
          }

          return (
            <DocumentItem
              icon={item.icon}
              item={row.document}
              perspectiveStack={perspective.perspectiveStack}
            />
          );
        }}
      />
    </Flex>
  );
}

function ScrollableList<T>({
  getKey,
  items,
  maxHeight,
  renderItem,
}: {
  getKey: (item: T, index: number) => string | number;
  items: T[];
  maxHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
}) {
  return (
    <Box
      style={{
        maxHeight,
        overflowY: 'auto',
        scrollBehavior: 'smooth',
        width: '100%',
      }}
    >
      <Stack>
        {items.map((item, index) => {
          const isFirst = index === 0;
          const isLast = index === items.length - 1;

          return (
            <Box
              key={getKey(item, index)}
              paddingBottom={isLast ? 1 : undefined}
              paddingTop={isFirst ? 1 : undefined}
              paddingX={1}
            >
              {renderItem(item, index)}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

function PageItem({ item }: { item: MenuItem }) {
  const { onSelect } = useNavigation();

  return (
    <Button
      onClick={() => {
        onSelect?.({
          label: item.omitLabelOnSelect ? undefined : item.label,
          href: item.href,
        });
      }}
      mode="bleed"
      padding={1}
      width="fill"
    >
      <Box style={{ width: '100%' }}>
        <SanityDefaultPreview
          layout="compact"
          title={item.label}
          media={item.icon}
          icon={item.icon ? undefined : false}
        />
      </Box>
    </Button>
  );
}

function DocumentItem({
  icon,
  item,
  perspectiveStack,
}: {
  icon?: () => React.ReactNode;
  item: SanityDocument & {
    title?: string;
    label?: string;
    _type?: string;
    _id?: string;
  };
  perspectiveStack?: string[];
}) {
  const { onSelect } = useNavigation();
  const schema = useSchema();
  const schemaType = item._type ? schema.get(item._type) : undefined;
  const fallbackMedia = item._id === 'default' ? DefaultIcon : icon;

  return (
    <Button
      mode={'bleed'}
      width="fill"
      padding={1}
      onClick={() =>
        onSelect?.({
          reference: item._id,
          label: item.label || item.title,
          _type: item._type,
          _id: item._id,
        })
      }
    >
      {schemaType && item._id && item._type ? (
        <SearchResultItemPreview
          documentId={item._id}
          documentType={item._type}
          layout="compact"
          perspective={perspectiveStack}
          schemaType={schemaType}
          showBadge={false}
        />
      ) : (
        <Box style={{ width: '100%' }}>
          <SanityDefaultPreview
            layout="compact"
            title={item.label || item.title}
            media={fallbackMedia}
            icon={fallbackMedia ? undefined : false}
          />
        </Box>
      )}
    </Button>
  );
}

function SkeletonItem() {
  return (
    <Button mode="bleed" width="fill" padding={1} disabled>
      <Box style={{ width: '100%' }}>
        <SanityDefaultPreview isPlaceholder layout="compact" />
      </Box>
    </Button>
  );
}

function EmptyFolderState() {
  const { onClose } = useNavigation();

  return (
    <Button mode="bleed" width="fill" padding={1} onClick={onClose}>
      <Box style={{ width: '100%' }}>
        <SanityDefaultPreview
          icon={false}
          layout="compact"
          title={<Text muted size={1}>No results</Text>}
        />
      </Box>
    </Button>
  );
}
