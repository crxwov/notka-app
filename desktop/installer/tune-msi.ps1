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

    # Reuse the stock patch controls for major upgrades. Condition is part of both table keys.
    $isUpdate = '(Installed AND PATCH) OR WIX_UPGRADE_DETECTED'
    $isFresh = 'NOT Installed AND NOT WIX_UPGRADE_DETECTED'
    $events = @(
        @('WelcomeDlg', 'Next', 'NewDialog', 'LicenseAgreementDlg', $isFresh, 1),
        @('WelcomeDlg', 'Next', 'NewDialog', 'VerifyReadyDlg', $isUpdate, 2),
        @('WelcomeDlg', 'Next', '[WixUI_InstallMode]', 'Update', $isUpdate, 1),
        @('VerifyReadyDlg', 'Back', 'NewDialog', 'InstallDirDlg', $isFresh, 1),
        @('VerifyReadyDlg', 'Back', 'NewDialog', 'WelcomeDlg', $isUpdate, 2)
    )
    foreach ($row in $events) {
        $dialog, $control, $event, $argument, $condition, $order = $row
        $view = $db.OpenView("DELETE FROM ControlEvent WHERE Dialog_='$dialog' AND Control_='$control' AND Argument='$argument'")
        $view.Execute()
        $view.Close()
        $view = $db.OpenView("INSERT INTO ControlEvent (Dialog_, Control_, Event, Argument, Condition, Ordering) VALUES ('$dialog', '$control', '$event', '$argument', '$condition', $order)")
        $view.Execute()
        $view.Close()
    }

    $conditions = @(
        @('WelcomeDlg', 'Description', 'Hide', $isUpdate),
        @('WelcomeDlg', 'PatchDescription', 'Hide', "NOT ($isUpdate)"),
        @('WelcomeDlg', 'Description', 'Show', "NOT ($isUpdate)"),
        @('WelcomeDlg', 'PatchDescription', 'Show', $isUpdate),
        @('VerifyReadyDlg', 'InstallText', 'Hide', "NOT ($isFresh)"),
        @('VerifyReadyDlg', 'UpdateText', 'Hide', 'WixUI_InstallMode <> "Update"'),
        @('VerifyReadyDlg', 'Install', 'Show', "$isFresh AND ALLUSERS"),
        @('VerifyReadyDlg', 'InstallNoShield', 'Show', "$isFresh AND NOT ALLUSERS"),
        @('VerifyReadyDlg', 'InstallText', 'Show', $isFresh),
        @('VerifyReadyDlg', 'Install', 'Enable', $isFresh),
        @('VerifyReadyDlg', 'InstallNoShield', 'Enable', $isFresh),
        @('VerifyReadyDlg', 'Install', 'Default', $isFresh),
        @('VerifyReadyDlg', 'InstallNoShield', 'Default', $isFresh)
    )
    foreach ($row in $conditions) {
        $dialog, $control, $action, $condition = $row
        $view = $db.OpenView("DELETE FROM ControlCondition WHERE Dialog_='$dialog' AND Control_='$control' AND Action='$action'")
        $view.Execute()
        $view.Close()
        $view = $db.OpenView("INSERT INTO ControlCondition (Dialog_, Control_, Action, Condition) VALUES ('$dialog', '$control', '$action', '$condition')")
        $view.Execute()
        $view.Close()
    }

    # Keep one heading on each screen, including during a major upgrade.
    $headings = @(
        @('VerifyReadyDlg', 'InstallTitle', 'Подтверждение', 'InstallTitle', 'UpdateTitle', 'ChangeTitle', 'RepairTitle', 'RemoveTitle'),
        @('ProgressDlg', 'TitleInstalling', 'Выполнение', 'TitleInstalling', 'TitleUpdating', 'TitleChanging', 'TitleRepairing', 'TitleRemoving')
    )
    foreach ($row in $headings) {
        $dialog, $heading, $label, $controls = $row
        foreach ($control in $controls) {
            $view = $db.OpenView("DELETE FROM ControlCondition WHERE Dialog_='$dialog' AND Control_='$control'")
            $view.Execute()
            $view.Close()
            $view = $db.OpenView("UPDATE Control SET Attributes=196610 WHERE Dialog_='$dialog' AND Control='$control'")
            $view.Execute()
            $view.Close()
        }
        $view = $db.OpenView("UPDATE Control SET Attributes=196611, Text='{\WixUI_Font_Title}$label [ProductName]' WHERE Dialog_='$dialog' AND Control='$heading'")
        $view.Execute()
        $view.Close()
    }

    # Let Restart Manager close the processes locking files in this installation.
    $rmUi = @(
        "UPDATE Control SET X=194, Width=102, Text='Закрыть Нотку' WHERE Dialog_='MsiRMFilesInUse' AND Control='OK'",
        "UPDATE Control SET Attributes=0 WHERE Dialog_='MsiRMFilesInUse' AND Control='ShutdownOption'",
        "UPDATE Control SET Text='Закройте Нотку кнопкой ниже, чтобы продолжить обновление.' WHERE Dialog_='MsiRMFilesInUse' AND Control='Text'",
        "DELETE FROM ControlEvent WHERE Dialog_='MsiRMFilesInUse' AND Control_='OK'",
        "INSERT INTO ControlEvent (Dialog_, Control_, Event, Argument, Condition, Ordering) VALUES ('MsiRMFilesInUse', 'OK', 'RMShutdownAndRestart', '0', '1', 1)",
        "INSERT INTO ControlEvent (Dialog_, Control_, Event, Argument, Condition, Ordering) VALUES ('MsiRMFilesInUse', 'OK', 'EndDialog', 'Return', '1', 2)"
    )
    foreach ($sql in $rmUi) {
        $view = $db.OpenView($sql)
        $view.Execute()
        $view.Close()
    }

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
