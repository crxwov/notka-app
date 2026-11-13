package space.notka.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

public class MediaPlaybackService extends Service {
    private static final String TAG = "NotkaPlaybackService";
    private static final String CHANNEL_ID = "notka_playback_channel";
    private static final int NOTIFICATION_ID = 4242;

    public static final String ACTION_UPDATE_TRACK = "space.notka.app.UPDATE_TRACK";
    public static final String ACTION_UPDATE_STATE = "space.notka.app.UPDATE_STATE";
    public static final String ACTION_PLAY = "space.notka.app.PLAY";
    public static final String ACTION_PAUSE = "space.notka.app.PAUSE";
    public static final String ACTION_PREV = "space.notka.app.PREV";
    public static final String ACTION_NEXT = "space.notka.app.NEXT";
    public static final String ACTION_STOP = "space.notka.app.STOP";

    public static final String EXTRA_TITLE = "extra_title";
    public static final String EXTRA_ARTIST = "extra_artist";
    public static final String EXTRA_ALBUM = "extra_album";
    public static final String EXTRA_ARTWORK = "extra_artwork";
    public static final String EXTRA_IS_PLAYING = "extra_is_playing";

    private MediaSession mediaSession;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    private String currentTitle = "\u041d\u043e\u0442\u043a\u0430"; // Нотка
    private String currentArtist = "\u041c\u0443\u0437\u044b\u043a\u0430"; // Музыка
    private String currentAlbum = "";
    private String currentArtworkUrl = "";
    private Bitmap currentArtworkBitmap = null;
    private boolean isPlaying = false;

    public static void updateMetadata(Context context, String title, String artist, String album, String artworkUrl, boolean isPlaying) {
        Intent intent = new Intent(context, MediaPlaybackService.class);
        intent.setAction(ACTION_UPDATE_TRACK);
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_ARTIST, artist);
        intent.putExtra(EXTRA_ALBUM, album);
        intent.putExtra(EXTRA_ARTWORK, artworkUrl);
        intent.putExtra(EXTRA_IS_PLAYING, isPlaying);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to start service for metadata update", e);
        }
    }

    public static void updateState(Context context, boolean isPlaying) {
        Intent intent = new Intent(context, MediaPlaybackService.class);
        intent.setAction(ACTION_UPDATE_STATE);
        intent.putExtra(EXTRA_IS_PLAYING, isPlaying);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to start service for state update", e);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        initMediaSession();
        initPowerLocks();
    }

    private void initPowerLocks() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Notka:PlaybackWakeLock");
                wakeLock.setReferenceCounted(false);
            }
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Notka:PlaybackWifiLock");
                wifiLock.setReferenceCounted(false);
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to initialize wake locks", e);
        }
    }

    private void updateLocks(boolean active) {
        try {
            if (active) {
                if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire(12 * 60 * 60 * 1000L); // 12h max
                if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
            } else {
                if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
                if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error updating wake locks", e);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    getString(R.string.channel_name),
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription(getString(R.string.channel_desc));
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private void initMediaSession() {
        mediaSession = new MediaSession(this, "NotkaMediaSession");
        mediaSession.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                handleMediaAction(ACTION_PLAY);
            }

            @Override
            public void onPause() {
                handleMediaAction(ACTION_PAUSE);
            }

            @Override
            public void onSkipToNext() {
                handleMediaAction(ACTION_NEXT);
            }

            @Override
            public void onSkipToPrevious() {
                handleMediaAction(ACTION_PREV);
            }

            @Override
            public void onStop() {
                handleMediaAction(ACTION_STOP);
            }
        });
        mediaSession.setActive(true);
    }

    private void handleMediaAction(String action) {
        if (MainActivity.getInstance() != null) {
            MainActivity.getInstance().dispatchMediaCommand(action);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.getAction() != null) {
            String action = intent.getAction();
            if (ACTION_UPDATE_TRACK.equals(action)) {
                currentTitle = intent.getStringExtra(EXTRA_TITLE);
                if (currentTitle == null || currentTitle.trim().isEmpty()) currentTitle = "Нотка";
                currentArtist = intent.getStringExtra(EXTRA_ARTIST);
                if (currentArtist == null) currentArtist = "";
                currentAlbum = intent.getStringExtra(EXTRA_ALBUM);
                if (currentAlbum == null) currentAlbum = "";
                String newArtwork = intent.getStringExtra(EXTRA_ARTWORK);
                isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, true);

                updateLocks(isPlaying);

                if (newArtwork != null && !newArtwork.equals(currentArtworkUrl)) {
                    currentArtworkUrl = newArtwork;
                    currentArtworkBitmap = null;
                    fetchArtworkAsync(newArtwork);
                }
                updateNotificationAndSession();
            } else if (ACTION_UPDATE_STATE.equals(action)) {
                isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, false);
                updateLocks(isPlaying);
                updateNotificationAndSession();
            } else if (ACTION_PLAY.equals(action) || ACTION_PAUSE.equals(action) ||
                       ACTION_NEXT.equals(action) || ACTION_PREV.equals(action) ||
                       ACTION_STOP.equals(action)) {
                handleMediaAction(action);
            }
        }
        return START_NOT_STICKY;
    }

    private void fetchArtworkAsync(String urlStr) {
        if (urlStr == null || urlStr.trim().isEmpty()) {
            currentArtworkBitmap = null;
            return;
        }

        new Thread(() -> {
            try {
                CoverCache cache = CoverCache.getInstance();
                byte[] bytes = cache != null ? cache.getCoverBytes(urlStr, true) : null;
                if (bytes != null && bytes.length > 0) {
                    currentArtworkBitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    updateNotificationAndSession();
                }
            } catch (Exception e) {
                Log.d(TAG, "Failed to load album artwork via CoverCache: " + e.getMessage());
            }
        }).start();
    }

    private Bitmap getFallbackIcon() {
        if (currentArtworkBitmap != null) return currentArtworkBitmap;
        int size = 128;
        Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.rgb(255, 45, 85)); // Brand pink/magenta
        c.drawCircle(size / 2f, size / 2f, size / 2f, p);
        return b;
    }

    private void updateNotificationAndSession() {
        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE |
                       PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS;

        PlaybackState state = new PlaybackState.Builder()
                .setActions(actions)
                .setState(isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                          PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1.0f)
                .build();
        mediaSession.setPlaybackState(state);

        MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, currentTitle)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, currentArtist)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, currentAlbum);
        if (currentArtworkBitmap != null) {
            metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, currentArtworkBitmap);
        }
        mediaSession.setMetadata(metaBuilder.build());

        Notification notification = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to call startForeground", e);
        }
    }

    private PendingIntent createPendingIntent(String action, int requestCode) {
        Intent intent = new Intent(this, MediaPlaybackService.class);
        intent.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getService(this, requestCode, intent, flags);
    }

    private Notification buildNotification() {
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, openAppIntent, piFlags);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        builder.setContentTitle(currentTitle)
               .setContentText(currentArtist)
               .setSubText(currentAlbum.isEmpty() ? "\u041d\u043e\u0442\u043a\u0430" : currentAlbum) // Нотка
               .setSmallIcon(R.drawable.ic_notification)
               .setLargeIcon(getFallbackIcon())
               .setContentIntent(contentIntent)
               .setVisibility(Notification.VISIBILITY_PUBLIC)
               .setOngoing(isPlaying)
               .setShowWhen(false);

        Notification.Action prevAction = new Notification.Action.Builder(
                R.drawable.ic_notification, "\u041f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0438\u0439", createPendingIntent(ACTION_PREV, 1)).build(); // Предыдущий
        Notification.Action playPauseAction = new Notification.Action.Builder(
                R.drawable.ic_notification, isPlaying ? "\u041f\u0430\u0443\u0437\u0430" : "\u0412\u043e\u0441\u043f\u0440\u043e\u0438\u0437\u0432\u0435\u0434\u0435\u043d\u0438\u0435", // Пауза : Воспроизведение
                createPendingIntent(isPlaying ? ACTION_PAUSE : ACTION_PLAY, 2)).build();
        Notification.Action nextAction = new Notification.Action.Builder(
                R.drawable.ic_notification, "\u0421\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439", createPendingIntent(ACTION_NEXT, 3)).build(); // Следующий

        builder.addAction(prevAction);
        builder.addAction(playPauseAction);
        builder.addAction(nextAction);

        Notification.MediaStyle mediaStyle = new Notification.MediaStyle();
        mediaStyle.setMediaSession(mediaSession.getSessionToken());
        mediaStyle.setShowActionsInCompactView(0, 1, 2);
        builder.setStyle(mediaStyle);

        return builder.build();
    }

    @Override
    public void onDestroy() {
        updateLocks(false);
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        stopForeground(true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
