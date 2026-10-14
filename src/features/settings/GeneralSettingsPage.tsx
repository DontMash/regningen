import { useEffect, useRef, useState } from 'react'
import { useSelector } from '@tanstack/react-store'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldTitle } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { toast } from '@/components/ui/toast'
import { applyThemeMode, themeModeLabels, themeStore } from '@/lib/theme-store'
import type { ThemeMode } from '@/lib/theme-store'
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
          : 'Der Browserspeicher ist nicht verfügbar.',
      )
    } finally {
      setResetting(false)
      setResetOpen(false)
    }
  }

  function selectTheme(value: string[]) {
    const selected = value[0] as ThemeMode | undefined
    if (!selected) return
    try {
      themeStore.setMode(selected, window.localStorage)
    } catch {
      toast.add({
        title: 'Darstellung konnte nicht gespeichert werden.',
        type: 'warning',
      })
    }
    applyThemeMode(selected)
  }
  return (
    <div className="flex flex-col gap-6">
      <h2 className="heading-2">Allgemein</h2>
      <Card>
        <CardHeader>
          <CardTitle>Darstellung</CardTitle>
          <CardDescription>
            Wähle eine Darstellung oder folge den Einstellungen deines Geräts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field orientation="horizontal" data-disabled={!isHydrated}>
            <FieldTitle id="appearance-label">Farbschema</FieldTitle>
            <ToggleGroup
              aria-labelledby="appearance-label"
              value={[isHydrated ? mode : 'auto']}
              disabled={!isHydrated}
              onValueChange={selectTheme}
              variant="outline"
            >
              {(
                Object.entries(themeModeLabels) as Array<[ThemeMode, string]>
              ).map(([value, label]) => (
                <ToggleGroupItem key={value} value={value}>
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Benachrichtigungen</CardTitle>
          <CardDescription>
            Lokale Benachrichtigungen informieren dich nach einem erfolgreichen
            PDF-Export. Es gibt keine Erinnerungen oder Nachrichten von einem
            Server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationControl />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Installation</CardTitle>
          <CardDescription>
            Installiere regningen, um die Anwendung direkt von deinem Gerät zu
            öffnen. Benachrichtigungen werden dadurch nicht aktiviert.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InstallButton />
        </CardContent>
      </Card>
      <Separator />
      <Card>
        <CardHeader>
          <CardTitle>Anwendung zurücksetzen</CardTitle>
          <CardDescription>
            Lösche deine lokal gespeicherten Daten und Einstellungen in diesem
            Browser und beginne neu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resetError && (
            <Alert variant="destructive" role="alert">
              <AlertTitle>Anwendung nicht vollständig zurückgesetzt</AlertTitle>
              <AlertDescription>
                Ein Teil der Daten wurde möglicherweise bereits gelöscht.{' '}
                {resetError} Prüfe die Speichereinstellungen und versuche es
                erneut.
              </AlertDescription>
            </Alert>
          )}
          <Button
            variant="destructive"
            onClick={() => setResetOpen(true)}
            disabled={resetting}
          >
            Anwendung zurücksetzen
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
            <AlertDialogTitle>Anwendung zurücksetzen?</AlertDialogTitle>
            <AlertDialogDescription>
              Das Unternehmensprofil, alle Rechnungseingaben einschließlich
              ungespeicherter Änderungen in den Tabs dieser Anwendung,
              Darstellung, Benachrichtigungseinstellungen und gelesene
              Versionshinweise werden in diesem Browser gelöscht.
              Heruntergeladene PDFs und Sicherungen, Browser-Berechtigungen,
              Installation und Offline-Verfügbarkeit bleiben erhalten. Andere
              Browser und Geräte sind nicht betroffen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} disabled={resetting}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={resetting}
              onClick={() => void reset()}
            >
              {resetting ? 'Wird zurückgesetzt …' : 'Anwendung zurücksetzen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
