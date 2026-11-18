package space.notka.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Minimal zero-dependency read-only ContentProvider that exposes only the
 * verified downloaded APK update file to Android's package installer.
 */
public class ApkFileProvider extends ContentProvider {
    public static final String AUTHORITY = "space.notka.app.apkprovider";
    public static final String APK_FILE_NAME = "notka-update.apk";
    private static final String MIME_APK = "application/vnd.android.package-archive";

    public static Uri getUpdateApkUri() {
        return new Uri.Builder()
                .scheme("content")
                .authority(AUTHORITY)
                .appendPath(APK_FILE_NAME)
                .build();
    }

    public static File getUpdateApkFile(Context context) {
        File dir = new File(context.getCacheDir(), "updates");
        return new File(dir, APK_FILE_NAME);
    }

    private File resolveValidatedFile(Uri uri) throws FileNotFoundException {
        if (uri == null || !AUTHORITY.equals(uri.getAuthority())) {
            throw new FileNotFoundException("Invalid authority");
        }
        String last = uri.getLastPathSegment();
        if (!APK_FILE_NAME.equals(last)) {
            throw new FileNotFoundException("Unsupported update path");
        }
        Context ctx = getContext();
        if (ctx == null) {
            throw new FileNotFoundException("Provider context unavailable");
        }
        File file = getUpdateApkFile(ctx);
        if (!file.exists() || !file.isFile()) {
            throw new FileNotFoundException("Update APK not found");
        }
        return file;
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public String getType(Uri uri) {
        return MIME_APK;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        try {
            File file = resolveValidatedFile(uri);
            String[] cols = (projection != null && projection.length > 0)
                    ? projection
                    : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
            MatrixCursor cursor = new MatrixCursor(cols, 1);
            Object[] row = new Object[cols.length];
            for (int i = 0; i < cols.length; i++) {
                if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) {
                    row[i] = APK_FILE_NAME;
                } else if (OpenableColumns.SIZE.equals(cols[i])) {
                    row[i] = file.length();
                } else {
                    row[i] = null;
                }
            }
            cursor.addRow(row);
            return cursor;
        } catch (FileNotFoundException e) {
            return null;
        }
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (mode == null || !mode.startsWith("r") || mode.contains("w")) {
            throw new SecurityException("Read-only provider");
        }
        File file = resolveValidatedFile(uri);
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException("Read-only provider");
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("Read-only provider");
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("Read-only provider");
    }
}
