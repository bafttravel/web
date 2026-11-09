'use client';

import { useState, useCallback, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Video, Youtube, X } from 'lucide-react';
import { uploadVideo } from '@/lib/utils/upload';
import { toast } from 'sonner';
import AdminFilePicker from './AdminFilePicker';

const VIDEO_ACCEPT = { 'video/mp4': ['.mp4'], 'video/webm': ['.webm'], 'video/quicktime': ['.mov'] };
// YouTube: watch, youtu.be, embed, Shorts
const YOUTUBE_ID_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
const TIKTOK_VIDEO_REGEX = /(?:tiktok\.com\/@[^/]+\/video\/|tiktok\.com\/[^/]+\/video\/)(\d+)/;
/** Código de insertar de TikTok: data-video-id="..." */
const TIKTOK_EMBED_DATA_VIDEO_ID = /data-video-id="(\d+)"/;
/** cite="https://www.tiktok.com/.../video/123" dentro del blockquote */
const TIKTOK_CITE_VIDEO_ID = /tiktok\.com\/[^"\/]+\/video\/(\d+)/;

function getYoutubeId(url: string): string | null {
  if (!url?.trim()) return null;
  const m = url.trim().match(YOUTUBE_ID_REGEX);
  return m ? m[1] : null;
}

/** Acepta URL de TikTok, o el código de insertar (blockquote con data-video-id o cite). */
function getTiktokVideoId(input: string): string | null {
  if (!input?.trim()) return null;
  const raw = input.trim();
  const mUrl = raw.match(TIKTOK_VIDEO_REGEX);
  if (mUrl) return mUrl[1];
  const mData = raw.match(TIKTOK_EMBED_DATA_VIDEO_ID);
  if (mData) return mData[1];
  const mCite = raw.match(TIKTOK_CITE_VIDEO_ID);
  if (mCite) return mCite[1];
  return null;
}

function getYoutubeThumbnail(id: string): string {
  return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
}

type Tab = 'local' | 'youtube';

type VideoSectionAdminProps = {
  videoUrl: string;
  youtubeVideoUrl: string;
  tiktokVideoId: string;
  videoOverlayText: string;
  onVideoUrlChange: (v: string) => void;
  onYoutubeVideoUrlChange: (v: string) => void;
  onTiktokVideoIdChange: (v: string) => void;
  onVideoOverlayTextChange: (v: string) => void;
  youtubeError?: string;
};

export default function VideoSectionAdmin({
  videoUrl,
  youtubeVideoUrl,
  tiktokVideoId,
  videoOverlayText,
  onVideoUrlChange,
  onYoutubeVideoUrlChange,
  onTiktokVideoIdChange,
  onVideoOverlayTextChange,
  youtubeError,
}: VideoSectionAdminProps) {
  const [tab, setTab] = useState<Tab>(videoUrl ? 'local' : youtubeVideoUrl || tiktokVideoId ? 'youtube' : 'local');
  const [isUploading, setIsUploading] = useState(false);

  const youtubeId = getYoutubeId(youtubeVideoUrl);
  const tiktokId = tiktokVideoId?.trim() || null;

  /** Valor mostrado en el input: URL de YouTube/Shorts o URL reconstruida para TikTok. */
  const externalVideoInputValue = useMemo(() => {
    if (youtubeVideoUrl?.trim()) return youtubeVideoUrl.trim();
    if (tiktokVideoId?.trim()) return `https://www.tiktok.com/@t/video/${tiktokVideoId.trim()}`;
    return '';
  }, [youtubeVideoUrl, tiktokVideoId]);

  const setExternalVideoFromInput = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        onYoutubeVideoUrlChange('');
        onTiktokVideoIdChange('');
        return;
      }
      const tikId = getTiktokVideoId(trimmed);
      if (tikId) {
        onTiktokVideoIdChange(tikId);
        onYoutubeVideoUrlChange('');
        return;
      }
      const ytId = getYoutubeId(trimmed);
      if (ytId) {
        onYoutubeVideoUrlChange(trimmed);
        onTiktokVideoIdChange('');
        return;
      }
      onYoutubeVideoUrlChange(trimmed);
      onTiktokVideoIdChange('');
    },
    [onYoutubeVideoUrlChange, onTiktokVideoIdChange]
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      const video = list.find((f) => f.type.startsWith('video/'));
      if (!video) {
        toast.error('Solo se permiten archivos de video (MP4, WebM).');
        return;
      }
      setIsUploading(true);
      try {
        const url = await uploadVideo(video);
        onVideoUrlChange(url);
        toast.success('Video subido correctamente.');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error al subir el video.');
        throw new Error('No se pudo subir el video. Intentá de nuevo.');
      } finally {
        setIsUploading(false);
      }
    },
    [onVideoUrlChange]
  );


  const clearLocal = () => {
    onVideoUrlChange('');
  };

  const clearExternal = () => {
    onYoutubeVideoUrlChange('');
    onTiktokVideoIdChange('');
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
        <button
          type="button"
          onClick={() => setTab('local')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition ${
            tab === 'local' ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Video className="h-4 w-4" />
          Video local
        </button>
        <button
          type="button"
          onClick={() => setTab('youtube')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition ${
            tab === 'youtube' ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Youtube className="h-4 w-4" />
          YouTube / TikTok
        </button>
      </div>

      {/* Local */}
      {tab === 'local' && (
        <div className="space-y-3">
          {/* Drop zone */}
          <AdminFilePicker label="Video local" description="MP4, WebM o MOV. Se reproduce en la portada." accept={VIDEO_ACCEPT} busy={isUploading} onFilesSelected={handleFiles} processingLabel="Subiendo video…" successLabel="Video adjunto" showSelectedFiles={false} />

          {/* Preview local (compacto) */}
          {videoUrl && (
            <div className="w-full max-w-[200px] rounded-lg border border-gray-200 bg-gray-900 overflow-hidden">
              <div className="flex items-center justify-between px-2 py-1.5 bg-gray-800">
                <span className="text-xs font-medium text-white/90">Vista previa</span>
                <Button type="button" variant="ghost" size="sm" onClick={clearLocal} className="h-6 px-1 text-white/80 hover:text-white hover:bg-white/10">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="aspect-video w-full">
                <video src={videoUrl} controls className="h-full w-full object-contain" preload="metadata" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* YouTube / Shorts / TikTok */}
      {tab === 'youtube' && (
        <div className="space-y-3">
          <div>
            <Label className="text-sm">URL del video (YouTube, Shorts o TikTok)</Label>
            <Input
              placeholder="https://www.youtube.com/watch?v=... o https://www.tiktok.com/@user/video/..."
              value={externalVideoInputValue}
              onChange={(e) => setExternalVideoFromInput(e.target.value)}
              className="mt-1.5"
            />
            {youtubeError && <p className="mt-1 text-sm text-red-500">{youtubeError}</p>}
            <p className="mt-1 text-xs text-gray-500">Acepta URL de YouTube, Shorts o TikTok, o el código de insertar de TikTok (blockquote con data-video-id). En el front se reproduce automáticamente con sonido y sin controles.</p>
          </div>
          {youtubeId && (
            <div className="w-full max-w-[200px] rounded-lg border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-2 py-1.5 bg-gray-100">
                <span className="text-xs font-medium text-gray-700">Vista previa (YouTube)</span>
                <Button type="button" variant="ghost" size="sm" onClick={clearExternal} className="h-6 px-1">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="aspect-video w-full bg-black">
                <img
                  src={getYoutubeThumbnail(youtubeId)}
                  alt="Miniatura YouTube"
                  className="h-full w-full object-contain"
                />
              </div>
            </div>
          )}
          {tiktokId && !youtubeId && (
            <div className="w-full max-w-[200px] rounded-lg border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-2 py-1.5 bg-gray-100">
                <span className="text-xs font-medium text-gray-700">Vista previa (TikTok)</span>
                <Button type="button" variant="ghost" size="sm" onClick={clearExternal} className="h-6 px-1">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="aspect-9/16 w-full bg-black flex items-center justify-center">
                <span className="text-xs text-white/80">TikTok #{tiktokId}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Texto overlay (común) */}
      <div>
        <Label className="text-sm">Texto overlay del video</Label>
        <Input
          placeholder="Ej: Temporada alta en Río · Reservá hoy"
          value={videoOverlayText}
          onChange={(e) => onVideoOverlayTextChange(e.target.value)}
          className="mt-1.5"
        />
      </div>
    </div>
  );
}
