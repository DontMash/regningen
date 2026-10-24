import { useEffect, useRef, useState } from 'react'
import { useSelector } from '@tanstack/react-store'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import * as m from '@/paraglide/messages'
import {
  LanguageSelect,
  InvoiceLanguageSelect,
} from '@/components/LanguageSelect'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldTitle,
} from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  isThemeMode,
  selectThemeMode,
  themeModeLabels,
  themeStore,
} from '@/lib/theme-store'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { InstallButton, NotificationControl } from '@/features/pwa/PwaControls'
import { resetApplication } from './application-reset'

export default function GeneralSettingsPage() {
  const mode = useSelector(themeStore.store, (state) => state.mode)
  const [isHydrated, setIsHydrated] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // The header may restore the theme before this SSR-rendered route hydrates.
  useEffect(() => setIsHydrated(true), [])

  async function reset() {
    setResetting(true)
    setResetError(null)
    try {
      await resetApplication()
    } catch (error) {
      setResetError(
        error instanceof Error
          ? error.message
          : m.settings_storage_unavailable(),
      )
    } finally {
      setResetting(false)
      setResetOpen(false)
    }
  }

  function selectTheme(value: string[]) {
    const selected = value[0]
    if (isThemeMode(selected)) selectThemeMode(selected)
  }
  return (
    <div className="flex flex-col gap-6">
      <h2 className="heading-2">{m.settings_general()}</h2>
      <Card>
        <CardHeader>
          <CardTitle>{m.settings_languages()}</CardTitle>
          <CardDescription>
            {m.settings_languages_description()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="interface-language">
                {m.common_interface_language()}
              </FieldLabel>
              <LanguageSelect id="interface-language" />
            </Field>
            <Field>
              <FieldLabel htmlFor="invoice-language">
                {m.common_invoice_language()}
              </FieldLabel>
              <InvoiceLanguageSelect id="invoice-language" />
              <FieldDescription>
                {m.settings_invoice_language_hint()}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{m.settings_appearance()}</CardTitle>
          <CardDescription>
            {m.settings_appearance_description()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field orientation="horizontal" data-disabled={!isHydrated}>
            <FieldTitle id="appearance-label">
              {m.settings_colour_scheme()}
            </FieldTitle>
            <ToggleGroup
              aria-labelledby="appearance-label"
              value={[isHydrated ? mode : 'auto']}
              disabled={!isHydrated}
              onValueChange={selectTheme}
              variant="outline"
            >
              {(['auto', 'light', 'dark'] as const).map((value) => (
                <ToggleGroupItem key={value} value={value}>
                  {themeModeLabels[value]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{m.settings_notifications()}</CardTitle>
          <CardDescription>
            {m.settings_notifications_description()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationControl />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{m.settings_installation()}</CardTitle>
          <CardDescription>
            {m.settings_installation_description()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InstallButton />
        </CardContent>
      </Card>
      <Separator />
      <Card>
        <CardHeader>
          <CardTitle>{m.settings_reset()}</CardTitle>
          <CardDescription>{m.settings_reset_description()}</CardDescription>
        </CardHeader>
        <CardContent>
          {resetError && (
            <Alert variant="destructive" role="alert">
              <AlertTitle>{m.settings_reset_incomplete()}</AlertTitle>
              <AlertDescription>
                {m.settings_reset_failed({ error: resetError })}
              </AlertDescription>
            </Alert>
          )}
          <Button
            variant="destructive"
            onClick={() => setResetOpen(true)}
            disabled={resetting}
          >
            {m.settings_reset()}
          </Button>
        </CardContent>
      </Card>
      <AlertDialog
        open={resetOpen}
        onOpenChange={(open) => {
          if (!resetting) setResetOpen(open)
        }}
      >
        <AlertDialogContent initialFocus={cancelRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.settings_reset_confirm()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.settings_reset_scope()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} disabled={resetting}>
              {m.settings_cancel()}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={resetting}
              onClick={() => void reset()}
            >
              {resetting ? m.settings_resetting() : m.settings_reset()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
