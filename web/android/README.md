# Stillwild Android companion 0.1.0

Development candidate for an owner-controlled, cross-app garden bubble. Android 8.0 (API 26) or newer. This source implements the requested bounded native milestone; independent native foundation closure and physical-device acceptance remain unexecuted.

## Use on your phone

1. Install the supplied development APK. If Android asks, allow this installation from the app you used to open the APK. No app-store release is implied.
2. Open the Stillwild website in Chrome. Open the information panel (ⓘ), choose **Save for Android**, and keep `my-stillwild-garden.json`. The current public Site has one shared origin; this export does not establish a separate cloud account for you.
3. Open the installed **Stillwild** app. Choose **Import my garden** and select that JSON file.
4. Choose **Show floating garden**. Enable **Display over other apps** when directed, return to Stillwild, and tap **Show floating garden** again. Allow notifications when asked.
5. Open Messenger or YouTube. Drag the orb to move it; tap it to expand. The title bar moves the expanded view. Use **×**, **Hide floating garden**, or the notification's **Hide** action to stop it.

Import is idempotent for the same seed and birth time. A different garden is refused without replacing the saved garden. The regular **Give a piece** export is a descendant gift and cannot be imported here. Exporting, importing and hiding do not change the website's garden.

## What this version does

- A native `TYPE_APPLICATION_OVERLAY` window backed by a user-started foreground service, with an ongoing notification and explicit hide controls.
- Original seed, original birth time, and the website's actual v1 growth and renderer functions. The app bundles its art and runtime, works offline, and reconstructs growth from the phone's clock.
- Local app-private garden storage. No network, accessibility, screen-reading or broad storage permission. Only the selected JSON file is read via Android's file picker.
- A small collapsed window that leaves the rest of the screen touchable. Expanded rendering is capped at 10 fps, or 1 fps with reduced motion. The collapsed orb uses a still image. The view pauses while locked or the display is off.
- Position snapping, clamping after rotation, and saved preferred edge/vertical position.

This is an offline view of the same immutable beginning, not a new cloud account or live synchronisation connection. The phone clock must be correct. If growth rules change in a later release, the native adapter must preserve/version the v1 rules. The website remains the durable owner copy. Clearing app data or uninstalling removes the local copy; reimport the original JSON to recover it.

Android can hide overlays on protected screens, and battery/process management can stop the service. It does not restart itself after a force-stop, a reboot, or a notification/overlay permission change. Reopen the app and choose Show floating garden. There is no promise of an unstoppable process. Native live wallpaper, sound and gift modules inside the Android overlay, iOS, and store publication are outside this milestone.

## Build

Open `android/` in Android Studio, or use JDK 17, Android SDK platform 35 and build-tools 35.0.0:

```sh
./gradlew :app:testDebugUnitTest :app:assembleDebug
```

On Windows, use `gradlew.bat`. Set `ANDROID_HOME` to your SDK, or use Android Studio's local SDK configuration. The wrapper pins Gradle 8.11.1; the project pins Android Gradle Plugin 8.9.2. Runtime Java dependencies: none.

The scene is committed as a generated offline asset so this Android project can build independently. After changing website growth, art or rendering, regenerate from the repository root and verify it:

```sh
node scripts/build-android-scene.cjs
node scripts/verify-android.cjs
```

The second command needs the Node canvas runtime used by this workspace. `assets/provenance.json` records source hashes. No production seed is embedded in the APK or source.

The supplied APK is debug-signed for this development test, not a production release. Future updates must use the same signing identity to install over it. Signing-key continuity and release distribution must be established before a durable production release. Keep the JSON backup before changing installations.

The supplied APK was compiled with the official SDK tools directly because this workspace's Gradle JVM could not reach its configured repository proxy. Java compilation, D8 conversion, resource/asset packaging, alignment and v2/v3 signature verification all executed. The Gradle wrapper itself was generated successfully; the full Gradle app build remains unverified here. The actual packaging path is reproducible with installed tooling:

```sh
python scripts/build-android-sdk.py --sdk /path/to/android-sdk --java-home /path/to/jdk-17
```

`releases/build-evidence.json` identifies the actual APK and exact source inputs by SHA-256. The development signing key stays outside source under the checkout's ignored `.sites-runtime/` directory. A rebuild in another workspace creates a different development key unless key management is established separately. The key is not shipped.

## Phone acceptance

Record the actual phone model, Android version, WebView version and APK SHA-256 with each result. These checks are not passed by compilation or screenshots of the website.

| Check | Expected result | Current evidence |
|---|---|---|
| Import original / reopen | Same seed, birth time and displayed day | Local export/renderer and Java fixtures only |
| Reject gift, invalid file, second garden | No replacement of existing garden | Parser fixtures; device flow unexecuted |
| Deny permissions | No overlay; clear path back to settings | Source review only |
| Switch to Messenger / YouTube | Bubble stays available where overlays are permitted | Unexecuted |
| Drag / expand / rotate | Visible controls; other apps remain touchable outside window | Unexecuted |
| Hide via each of three controls | Window and foreground notification disappear | Unexecuted |
| Lock / unlock | No lock-screen garden; view resumes with elapsed growth | Unexecuted |
| Revoke permission / stop app / reboot | No forced restart; next manual start retains garden | Unexecuted |
| Airplane mode | Imported garden still opens and grows | Bundled renderer verified in Node; device unexecuted |

Primary platform references inspected 28 September 2026: [overlay windows](https://developer.android.com/reference/android/view/WindowManager.LayoutParams#TYPE_APPLICATION_OVERLAY), [overlay permission](https://developer.android.com/reference/android/Manifest.permission#SYSTEM_ALERT_WINDOW), [foreground services](https://developer.android.com/develop/background-work/services/fgs), and [special-use type](https://developer.android.com/develop/background-work/services/fgs/service-types#special-use). `specialUse` requires additional review if this is later submitted to Google Play; this build does not claim that approval.
