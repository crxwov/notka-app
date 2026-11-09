package space.notka.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;

public class NotkaFileProvider extends ContentProvider {
    public static final String AUTHORITY = "space.notka.app.provider";

    public static Uri getUriForFile(Context context, File file) {
        return Uri.parse("content://" + AUTHORITY + "/" + file.getName());
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (getContext() == null || uri == null || uri.getLastPathSegment() == null) {
            throw new FileNotFoundException("Invalid URI");
        }
        File file = new File(getContext().getCacheDir(), uri.getLastPathSegment());
        if (file.exists()) {
            return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
        }
        throw new FileNotFoundException("Update file not found: " + uri);
    }

    @Override
    public String getType(Uri uri) {
        return "application/vnd.android.package-archive";
    }

    @Override
    public Cursor query(Uri uri, String[] p, String s, String[] a, String so) { return null; }
    @Override
    public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }
    @Override
    public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
