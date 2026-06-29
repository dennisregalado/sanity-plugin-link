import React from 'react'
import {set, InputProps, ObjectInputProps, type SchemaType, unset, useClient} from 'sanity'
import {
  Popover,
  Button,
  Text,
  Flex,
  Grid,
  useClickOutsideEvent,
  Box,
  Card,
  Tooltip,
} from '@sanity/ui'
import {CloseIcon, EditIcon} from '@sanity/icons'
import {useState, useMemo, useRef, createContext, useContext, useEffect} from 'react'
import {
  VisualEditorNavigator,
  getFlattenedLinkRoutes,
  getReferenceTypesFromRoutes,
  getReferenceTypesFromSchemaType,
  getSystemLinkIcon,
  normalizeLinkIcon,
  normalizeLinkHref,
} from './navigator'
import {SanityDefaultPreview, SearchResultItemPreview, usePerspective} from 'sanity'
import {usePaneRouter} from 'sanity/structure'
import {randomKey} from '@sanity/util/content'
import type {LinkInputProps} from './types'
import type {LinkRouteDefinition, LinksPluginProps, StaticLinkRoute} from './navigator'
const SmallEditIcon = (props: React.ComponentProps<typeof EditIcon>) => (
  <EditIcon {...props} style={{...props.style, display: 'block'}} />
)
const sanityApiVersion = '2025-02-27'
type RouteConfig = LinkRouteDefinition[] | LinksPluginProps | undefined

function resolveRoutes(routes: RouteConfig): LinkRouteDefinition[] {
  if (!routes) {
    return []
  }

  return Array.isArray(routes) ? routes : routes.routes
}

const LinkContext = createContext<{
  onChange: ObjectInputProps['onChange']
  openPopover: () => void
  closePopover: () => void
  canOpenPopover: boolean
  searchQuery: string
  setSearchQuery: (query: string) => void
  flattenedRoutes: StaticLinkRoute[]
  replaceReference?: (inputProps: InputProps) => void
} | null>(null)

export function LinkInput(props: LinkInputProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const routes = resolveRoutes(props.schemaType.options?.routes || props.pluginOptions?.routes)
  const menu = useMemo(() => ({routes}), [routes])
  const flattenedRoutes = useMemo(() => getFlattenedLinkRoutes(menu.routes), [menu])
  const linkReferenceTypes = useMemo(() => getReferenceTypesFromRoutes(menu.routes), [menu])
  const canOpenPopover = flattenedRoutes.length > 0 || linkReferenceTypes.length > 0

  useClickOutsideEvent(
    () => {
      if (popoverOpen) {
        setPopoverOpen(false)
      }
    },
    () => [popoverRef.current, containerRef.current],
  )

  const hasReference = useMemo(() => {
    return Boolean((props.value as {reference?: unknown} | undefined)?.reference)
  }, [props.value])

  const referenceTypes = useMemo(() => {
    const schemaReferenceTypes = getReferenceTypesFromSchemaType(props.schemaType)
    return schemaReferenceTypes.length ? schemaReferenceTypes : linkReferenceTypes
  }, [linkReferenceTypes, props.schemaType])

  const labelField = useMemo(() => {
    return props.members.filter((member: any) => member.name === 'label')
  }, [props.members])

  const referenceField = useMemo(() => {
    return props.members
      .filter((member: any) => member.name === 'reference')
      .map((member: any) => ({
        ...member,
        field: {
          ...member.field,
          schemaType: {
            ...member.field.schemaType,
            components: {
              input: ReferencePreviewInput,
            },
          },
        },
      }))
  }, [props.members])

  const urlField = useMemo(() => {
    return props.members
      .filter((member: any) => member.name === 'url')
      .map((member: any) => ({
        ...member,
        field: {
          ...member.field,
          schemaType: {
            ...member.field.schemaType,
            components: {
              input: URLInput,
            },
          },
        },
      }))
  }, [props.members])

  return (
    <LinkContext.Provider
      value={{
        onChange: props.onChange,
        openPopover: () => {
          if (canOpenPopover) setPopoverOpen(true)
        },
        closePopover: () => {
          setPopoverOpen(false)
          setSearchQuery('')
        },
        canOpenPopover,
        searchQuery,
        setSearchQuery,
        flattenedRoutes,
        replaceReference: (inputProps) => {
          inputProps.onChange(unset())
          setSearchQuery('')
          if (canOpenPopover) setPopoverOpen(true)
          props.onPathFocus?.(['url'])
        },
      }}
    >
      <Popover
        referenceElement={containerRef.current}
        portal
        matchReferenceWidth
        content={
          <Box
            ref={popoverRef}
            onMouseDown={(event) => {
              event.preventDefault()
            }}
          >
            <VisualEditorNavigator
              {...menu}
              referenceTypes={referenceTypes}
              searchQuery={searchQuery}
              onClose={() => {
                setSearchQuery('')
                setPopoverOpen(false)
              }}
              onSelect={(selected) => {
                const key = props.value?._key || randomKey(12)

                props.onChange(
                  set({
                    _type: 'link',
                    _key: key,
                    label: selected?.label || null,
                    ...(selected._id
                      ? {
                          reference: {
                            _type: 'reference',
                            _ref: selected._id,
                            _weak: true,
                          },
                        }
                      : {
                          url: selected.href || null,
                          reference: null,
                        }),
                  }),
                )
                setSearchQuery('')
                setPopoverOpen(false)
              }}
            />
          </Box>
        }
        padding={0}
        placement="top"
        animate
        open={canOpenPopover && popoverOpen}
      />
      <Grid gridTemplateColumns={2} gapX={1} gapY={3} width="fill">
        <Box>
          {props.renderDefault({
            ...props,
            members: labelField,
          })}
        </Box>
        <Box ref={containerRef}>
          {hasReference
            ? props.renderDefault({
                ...props,
                members: referenceField,
              })
            : props.renderDefault({
                ...props,
                members: urlField,
              })}
        </Box>
      </Grid>
    </LinkContext.Provider>
  )
}

function ReferencePreviewInput(props: InputProps) {
  const linkContext = useContext(LinkContext)
  const client = useClient({apiVersion: sanityApiVersion})
  const perspective = usePerspective()
  const {ReferenceChildLink, groupIndex, routerPanesState} = usePaneRouter()
  const documentId = (props.value as {_ref?: string} | undefined)?._ref
  const referenceSchemaType = props.schemaType as typeof props.schemaType & {
    to?: SchemaType[]
  }
  const allowedTypes = referenceSchemaType.to || []
  const allowedTypeNames = allowedTypes
    .map((type) => type.name)
    .filter(Boolean)
    .join('|')
  const [documentType, setDocumentType] = useState<string | null>(
    allowedTypes.length === 1 && allowedTypes[0]?.name ? allowedTypes[0].name : null,
  )
  const refType = documentType
    ? allowedTypes.find((toType) => toType.name === documentType)
    : undefined
  const linkTarget =
    documentId && documentType && refType ? {documentId, documentType, refType} : null
  const referencePaneOpen = linkTarget
    ? isReferencePaneOpen(routerPanesState, groupIndex, linkTarget)
    : false
  const preview = linkTarget ? (
    <SearchResultItemPreview
      documentId={linkTarget.documentId}
      documentType={linkTarget.documentType}
      layout="compact"
      perspective={perspective.perspectiveStack}
      schemaType={linkTarget.refType}
      showBadge={false}
    />
  ) : documentId ? (
    <Box style={{width: '100%'}}>
      <SanityDefaultPreview isPlaceholder layout="compact" />
    </Box>
  ) : null

  useEffect(() => {
    if (!documentId) {
      setDocumentType(null)
      return
    }

    if (allowedTypes.length === 1 && allowedTypes[0]?.name) {
      setDocumentType(allowedTypes[0].name)
      return
    }

    let cancelled = false

    client
      .fetch<string | null>('*[_id == $documentId][0]._type', {documentId})
      .then((type) => {
        if (!cancelled) setDocumentType(type)
      })
      .catch(() => {
        if (!cancelled) setDocumentType(null)
      })

    return () => {
      cancelled = true
    }
  }, [allowedTypeNames, client, documentId])

  return (
    <Card border radius={2} overflow="hidden">
      <Flex align="center" style={{height: 33}}>
        <Box flex={1} style={{minWidth: 0}}>
          {linkTarget ? (
            <ReferenceChildLink
              documentId={linkTarget.documentId}
              documentType={linkTarget.documentType}
              parentRefPath={props.path}
            >
              <Button
                as="span"
                mode={referencePaneOpen ? 'default' : 'bleed'}
                size={1}
                padding={0}
                tone={referencePaneOpen ? 'primary' : 'default'}
                width="fill"
                style={{clipPath: 'inset(3px round 2px)'}}
              >
                {preview}
              </Button>
            </ReferenceChildLink>
          ) : (
            <Button
              disabled
              mode="bleed"
              size={1}
              padding={0}
              width="fill"
              style={{clipPath: 'inset(3px round 2px)'}}
            >
              {preview}
            </Button>
          )}
        </Box>
        <Tooltip
          animate
          content={
            <Text size={1} weight="medium">
              Replace reference
            </Text>
          }
          placement="top"
        >
          <Button
            style={{clipPath: 'inset(3px round 2px)'}}
            icon={EditIcon}
            mode="bleed"
            onClick={() => linkContext?.replaceReference?.(props)}
          />
        </Tooltip>
      </Flex>
    </Card>
  )
}

function isReferencePaneOpen(
  routerPanesState: unknown,
  groupIndex: number,
  target: {
    documentId: string
    documentType: string
  },
) {
  const nextPaneGroup = Array.isArray(routerPanesState) ? routerPanesState[groupIndex + 1] : null
  const siblings = Array.isArray(nextPaneGroup)
    ? nextPaneGroup
    : nextPaneGroup
      ? [nextPaneGroup]
      : []

  return siblings.some((sibling) => {
    const pane = sibling as {
      id?: string
      params?: {
        id?: string
        type?: string
      }
      payload?: {
        id?: string
        type?: string
      }
    }
    const id = pane.id || pane.params?.id || pane.payload?.id
    const type = pane.params?.type || pane.payload?.type

    return id === target.documentId && (!type || type === target.documentType)
  })
}

function URLInput(props: InputProps) {
  const linkContext = useContext(LinkContext)
  const [draftValue, setDraftValue] = useState(typeof props.value === 'string' ? props.value : '')
  const [isFocused, setFocused] = useState(false)
  const previousValueRef = useRef(typeof props.value === 'string' ? props.value : '')
  const flattenedItems = linkContext?.flattenedRoutes || []
  const matchedMenuItem = useMemo(() => {
    if (!draftValue) return null
    return flattenedItems.find((item) => item.path === draftValue)
  }, [draftValue, flattenedItems])

  useEffect(() => {
    const nextValue = typeof props.value === 'string' ? props.value : ''
    const valueChanged = previousValueRef.current !== nextValue

    previousValueRef.current = nextValue

    if (
      !isFocused ||
      (valueChanged && (!linkContext?.searchQuery || normalizeLinkHref(draftValue) === nextValue))
    ) {
      setDraftValue(nextValue)
    }
  }, [draftValue, isFocused, linkContext?.searchQuery, props.value])

  if (!linkContext) {
    throw new Error('URLInput must be used within LinkContext')
  }

  const commitDraftValue = () => {
    const nextValue = draftValue.trim()
    const nextHref = normalizeLinkHref(nextValue) || nextValue
    const currentValue = typeof props.value === 'string' ? props.value : ''

    linkContext.setSearchQuery('')

    if (nextHref === currentValue) {
      return
    }

    props.onChange(nextValue ? set(nextHref) : set(null))
  }

  function getIcon() {
    const normalizedHref = normalizeLinkHref(draftValue)
    const matchedRoute = normalizedHref
      ? flattenedItems.find((item) => item.path === normalizedHref)
      : null

    if (matchedRoute?.icon) {
      return normalizeLinkIcon(matchedRoute.icon, {shift: true})?.()
    }

    if (normalizedHref) {
      return getSystemLinkIcon(normalizedHref, {shift: true})()
    }

    return undefined
  }

  return props.renderDefault({
    ...props,
    elementProps: {
      ...(props.elementProps as any),
      icon: getIcon(),
      value: draftValue,
      clearButton: draftValue
        ? {
            icon: isValidLink(draftValue) ? SmallEditIcon : CloseIcon,
          }
        : false,
      onBlur: (event: any) => {
        props.elementProps?.onBlur?.(event)
        setFocused(false)
        commitDraftValue()
      },
      onChange: (event: any) => {
        const nextValue = event.currentTarget.value
        setDraftValue(nextValue)
        if (linkContext.canOpenPopover) {
          linkContext.setSearchQuery(nextValue)
        }
      },
      onClear: () => {
        linkContext.closePopover()
        setDraftValue('')
        linkContext.setSearchQuery('')
        props.onChange(set(null))
      },
      onKeyDown: (event: any) => {
        ;(props.elementProps as any)?.onKeyDown?.(event)

        if (event.key === 'Enter') {
          event.preventDefault()
          commitDraftValue()
          linkContext.closePopover()
        }
      },
      onFocus: () => {
        setFocused(true)
        if (!linkContext.canOpenPopover) {
          return
        }

        const normalizedHref = normalizeLinkHref(draftValue)
        const isSavedHref = normalizedHref === draftValue.trim()

        linkContext.setSearchQuery(matchedMenuItem || isSavedHref ? '' : draftValue)
        linkContext.openPopover()
      },
    } as any,
  })
}

export function isValidLink(url: string | null | undefined): boolean {
  return Boolean(normalizeLinkHref(url))
}
