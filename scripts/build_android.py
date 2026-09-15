"""Build and sign the Android client with the installed SDK, without Gradle downloads."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
APP_URL = 'https://irenedaniele.streamlit.app/'


def run(*args, env=None):
    result = subprocess.run([str(a) for a in args], env=env, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout.strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sdk', type=Path, default=Path(os.environ.get('ANDROID_HOME',
                        str(Path(os.environ['LOCALAPPDATA'])/'Android/Sdk'))))
    args = parser.parse_args()
    keytool = shutil.which('keytool') or str(Path(r'C:\Program Files\Java\jdk-20\bin\keytool.exe'))
    sdk = args.sdk
    tools = sdk/'build-tools/35.0.0'
    android_jar = sdk/'platforms/android-36/android.jar'
    build = ROOT/'artifacts/android-build'
    for part in ('gen','classes','dex'):
        (build/part).mkdir(parents=True, exist_ok=True)
    gen = build/'gen/it/irenedaniele/brainracer'
    gen.mkdir(parents=True, exist_ok=True)
    (gen/'BuildConfig.java').write_text('package it.irenedaniele.brainracer; public final class BuildConfig {'
          'public static final String APP_URL = '+json.dumps(APP_URL)+';}', encoding='utf-8')
    run(tools/'aapt2.exe', 'compile', '--dir', ROOT/'android/res', '-o', build/'resources.zip')
    run(tools/'aapt2.exe', 'link', '-I', android_jar, '--manifest', ROOT/'android/AndroidManifest.xml',
        '--java', build/'gen', '--version-code', '2', '--version-name', '1.1',
        '-o', build/'base.apk', build/'resources.zip')
    sources = list((ROOT/'android/src').rglob('*.java'))+list((build/'gen').rglob('*.java'))
    run('javac', '-encoding', 'UTF-8', '-source', '8', '-target', '8', '-classpath', android_jar,
        '-d', build/'classes', *sources)
    run('java', '-cp', tools/'lib/d8.jar', 'com.android.tools.r8.D8', '--lib', android_jar,
        '--min-api', '26', '--output', build/'dex', *list((build/'classes').rglob('*.class')))
    shutil.copy2(build/'base.apk', build/'unsigned.apk')
    with ZipFile(build/'unsigned.apk', 'a', ZIP_DEFLATED) as z:
        for dex in (build/'dex').glob('*.dex'):
            z.write(dex, dex.name)
    run(tools/'zipalign.exe', '-f', '-p', '4', build/'unsigned.apk', build/'aligned.apk')
    private = ROOT/'.android-private'
    private.mkdir(exist_ok=True)
    keypass = private/'signing-password.txt'
    if not keypass.exists():
        keypass.write_text(secrets.token_urlsafe(32), encoding='utf-8')
    env = dict(os.environ, BRAINRACER_KEYPASS=keypass.read_text(encoding='utf-8'))
    keystore = private/'wedding-release.jks'
    if not keystore.exists():
        run(keytool, '-genkeypair', '-keystore', keystore, '-alias', 'wedding', '-keyalg', 'RSA',
            '-keysize', '2048', '-validity', '10000', '-storetype', 'JKS',
            '-storepass:env', 'BRAINRACER_KEYPASS', '-keypass:env', 'BRAINRACER_KEYPASS',
            '-dname', 'CN=Irene e Daniele, OU=Brain Racer, O=Wedding Game, C=IT', env=env)
    out = ROOT/'artifacts/Irene-e-Daniele.apk'
    run('java', '-jar', tools/'lib/apksigner.jar', 'sign', '--ks', keystore, '--ks-key-alias', 'wedding',
        '--ks-pass', 'env:BRAINRACER_KEYPASS', '--key-pass', 'env:BRAINRACER_KEYPASS',
        '--out', out, build/'aligned.apk', env=env)
    verification = run('java', '-jar', tools/'lib/apksigner.jar', 'verify', '--verbose', out)
    print(verification)
    sha = hashlib.sha256(out.read_bytes()).hexdigest()
    out.with_suffix('.apk.sha256').write_text(sha+'  '+out.name+'\n', encoding='ascii')
    print('APK:', out)
    print('App URL:', APP_URL)
    print('SHA256:', sha)


if __name__ == '__main__':
    main()
