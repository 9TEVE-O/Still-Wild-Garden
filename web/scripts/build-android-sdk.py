"""Build the development APK with official SDK tools when Gradle downloads are unavailable.

Requires JDK 17, Android platform 35 and build-tools 35.0.0. Does not download tools,
accept licences, alter the production garden, or use a production signing key.
"""
import argparse
import os
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
import zipfile
import hashlib
import json
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--sdk', required=True)
parser.add_argument('--java-home', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
sdk, java = Path(args.sdk).resolve(), Path(args.java_home).resolve()
tools = sdk / 'build-tools/35.0.0'
platform = sdk / 'platforms/android-35/android.jar'
build_root = root / '.sites-runtime/android-build'
build_root.mkdir(parents=True, exist_ok=True)
work = Path(tempfile.mkdtemp(prefix='compile-', dir=build_root))
out = root / 'android/releases/stillwild-0.1.0-debug.apk'
for directory in [work, work/'generated', work/'classes', work/'dex', out.parent]:
    directory.mkdir(parents=True, exist_ok=True)
env = dict(os.environ, JAVA_HOME=str(java))
def run(*command):
    subprocess.run([str(value) for value in command], cwd=root, env=env, check=True)

android = 'http://schemas.android.com/apk/res/android'
ET.register_namespace('android', android)
manifest = ET.parse(root / 'android/app/src/main/AndroidManifest.xml')
manifest.getroot().set('package', 'garden.stillwild.companion')
manifest.getroot().find('application').set('{'+android+'}debuggable', 'true')
manifest.write(work/'AndroidManifest.xml', encoding='utf-8', xml_declaration=True)
run(tools/'aapt2', 'compile', '--dir', root/'android/app/src/main/res', '-o', work/'resources.zip')
run(tools/'aapt2', 'link', '-I', platform, '--manifest', work/'AndroidManifest.xml',
    '--min-sdk-version', '26', '--target-sdk-version', '35', '--version-code', '1', '--version-name', '0.1.0',
    '--java', work/'generated', '-A', root/'android/app/src/main/assets', '-o', work/'resources.apk', work/'resources.zip')
sources = sorted((root/'android/app/src/main/java').rglob('*.java')) + sorted((work/'generated').rglob('*.java'))
run(java/'bin/javac', '-encoding', 'UTF-8', '--release', '8', '-classpath', platform,
    '-d', work/'classes', *sources)
run(java/'bin/java', '-cp', tools/'lib/d8.jar', 'com.android.tools.r8.D8', '--lib', platform,
    '--min-api', '26', '--output', work/'dex', *sorted((work/'classes').rglob('*.class')))
with zipfile.ZipFile(work/'resources.apk') as resources, zipfile.ZipFile(work/'unsigned.apk', 'w') as apk:
    for item in resources.infolist():
        apk.writestr(item, resources.read(item.filename))
    for dex in sorted((work/'dex').glob('*.dex')):
        apk.write(dex, dex.name, compress_type=zipfile.ZIP_DEFLATED)
run(tools/'zipalign', '-f', '4', work/'unsigned.apk', work/'aligned.apk')
key = build_root/'development.keystore'
if not key.exists():
    run(java/'bin/keytool', '-genkeypair', '-keystore', key, '-storepass', 'android', '-keypass', 'android',
        '-alias', 'androiddebugkey', '-dname', 'CN=Android Debug,O=Android,C=US', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000')
run(java/'bin/java', '-jar', tools/'lib/apksigner.jar', 'sign', '--ks', key, '--ks-key-alias', 'androiddebugkey',
    '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--out', out, work/'aligned.apk')
run(java/'bin/java', '-jar', tools/'lib/apksigner.jar', 'verify', '--verbose', out)
digest = hashlib.sha256(out.read_bytes()).hexdigest()
(out.parent/(out.name+'.sha256')).write_text(digest+'  '+out.name+'\n')
inputs = sorted((root/'android/app/src/main').rglob('*')) + [Path(__file__).resolve()]
source_hashes = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs if p.is_file()}
evidence = {'status': 'COMPILED_AND_SIGNATURE_VERIFIED', 'method': 'Official SDK aapt2, JDK javac --release 8, D8, zipalign and apksigner',
    'sdk': 35, 'buildTools': '35.0.0', 'minSdk': 26, 'targetSdk': 35, 'apkBytes': out.stat().st_size, 'apkSha256': digest,
    'sourceSha256': source_hashes, 'signing': 'Development key, APK signature schemes v2/v3',
    'gradleBuild': 'Not completed in this environment: Gradle JVM could not reach its configured repository proxy',
    'deviceExecution': 'NOT EXECUTED', 'independentNativeFoundationClosure': 'UNEXECUTED'}
(out.parent/'build-evidence.json').write_text(json.dumps(evidence, indent=2)+'\n')
print(f'APK: {out}\nBytes: {out.stat().st_size}\nSHA256: {digest}')
