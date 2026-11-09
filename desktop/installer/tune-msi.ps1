[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$MsiPath
)

$ErrorActionPreference = 'Stop'
$resolvedPath = (Resolve-Path $MsiPath).Path

$installer = New-Object -ComObject WindowsInstaller.Installer
$db = $installer.OpenDatabase($resolvedPath, 1)

try {
    # 1. Update ExitDialog OptionalCheckBox position (Launch Checkbox)
    $view = $db.OpenView("UPDATE Control SET Y=193, Height=17, Attributes=3 WHERE Dialog_='ExitDialog' AND Control='OptionalCheckBox'")
    $view.Execute()
    $view.Close()

    # 2. Insert DesktopShortcutCheckBox into Control table if not exists
    $view = $db.OpenView("SELECT Control FROM Control WHERE Dialog_='ExitDialog' AND Control='DesktopShortcutCheckBox'")
    $view.Execute()
    $exists = $view.Fetch()
    $view.Close()

    if (-not $exists) {
        $view = $db.OpenView("INSERT INTO Control (Dialog_, Control, Type, X, Y, Width, Height, Attributes, Property, Text) VALUES ('ExitDialog', 'DesktopShortcutCheckBox', 'CheckBox', 135, 170, 220, 17, 3, 'CREATE_DESKTOP_SHORTCUT', '[WIXUI_DESKTOPSHORTCUTTEXT]')")
        $view.Execute()
        $view.Close()
    }

    # 3. Ensure ExitDialog OptionalCheckBox shows on both fresh install and upgrade
    $view = $db.OpenView("DELETE FROM ControlCondition WHERE Dialog_='ExitDialog' AND Control_='OptionalCheckBox'")
    $view.Execute()
    $view.Close()

    $view = $db.OpenView("INSERT INTO ControlCondition (Dialog_, Control_, Action, Condition) VALUES ('ExitDialog', 'OptionalCheckBox', 'Show', 'WIXUI_EXITDIALOGOPTIONALCHECKBOXTEXT')")
    $view.Execute()
    $view.Close()

    # 4. WelcomeDlg upgrade text
    $view = $db.OpenView("DELETE FROM ControlCondition WHERE Dialog_='WelcomeDlg' AND Control_='PatchDescription' AND Action='Show'")
    $view.Execute()
    $view.Close()

    $view = $db.OpenView("INSERT INTO ControlCondition (Dialog_, Control_, Action, Condition) VALUES ('WelcomeDlg', 'PatchDescription', 'Show', '(Installed AND PATCH) OR WIX_UPGRADE_DETECTED')")
    $view.Execute()
    $view.Close()

    $view = $db.OpenView("DELETE FROM ControlCondition WHERE Dialog_='WelcomeDlg' AND Control_='Description' AND Action='Show'")
    $view.Execute()
    $view.Close()

    $view = $db.OpenView("INSERT INTO ControlCondition (Dialog_, Control_, Action, Condition) VALUES ('WelcomeDlg', 'Description', 'Show', '(NOT Installed OR NOT PATCH) AND NOT WIX_UPGRADE_DETECTED')")
    $view.Execute()
    $view.Close()

    # 5. CustomAction to delete shortcut if user unchecks CREATE_DESKTOP_SHORTCUT
    $view = $db.OpenView("SELECT Action FROM CustomAction WHERE Action='RemoveDesktopShortcutOnExit'")
    $view.Execute()
    $caExists = $view.Fetch()
    $view.Close()

    if (-not $caExists) {
        $view = $db.OpenView("INSERT INTO CustomAction (Action, Type, Source, Target) VALUES ('RemoveDesktopShortcutOnExit', 34, 'SystemFolder', 'cmd.exe /c del `"%USERPROFILE%\Desktop\Notka.lnk`" /f /q &amp; del `"%PUBLIC%\Desktop\Notka.lnk`" /f /q')")
        $view.Execute()
        $view.Close()
    }

    # 6. Wire RemoveDesktopShortcutOnExit on Finish
    $view = $db.OpenView("SELECT Control_ FROM ControlEvent WHERE Dialog_='ExitDialog' AND Control_='Finish' AND Argument='RemoveDesktopShortcutOnExit'")
    $view.Execute()
    $evExists = $view.Fetch()
    $view.Close()

    if (-not $evExists) {
        $view = $db.OpenView("INSERT INTO ControlEvent (Dialog_, Control_, Event, Argument, Condition, Ordering) VALUES ('ExitDialog', 'Finish', 'DoAction', 'RemoveDesktopShortcutOnExit', 'CREATE_DESKTOP_SHORTCUT <> 1', 2)")
        $view.Execute()
        $view.Close()
    }

    $db.Commit()
    Write-Host "MSI tables tuned for Upgrade & Exit Checkboxes successfully!" -ForegroundColor Green
} finally {
    $db = $null
    $installer = $null
}
