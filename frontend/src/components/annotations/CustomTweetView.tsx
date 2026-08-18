import React, { useState, useRef } from 'react';
import { useTweet } from 'react-tweet';
import { Heart, MessageCircle } from 'lucide-react';
import { useTranslation } from '../../contexts/I18nContext';

interface CustomTweetViewProps {
  id: string;
}

const VideoPlayer = ({ media, tweetUrl }: { media: any, tweetUrl: string }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlay = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!videoRef.current || hasError) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(err => {
        console.error("Play error:", err);
        setHasError(true);
      });
    } else {
      videoRef.current.pause();
    }
  };

  if (hasError) {
    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center bg-zinc-900 rounded-3xl p-6 text-center gap-4 min-w-0 min-h-0">
        <div className="text-white/60 mb-2">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4 opacity-50"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <p className="text-lg">Video playback blocked by X (Twitter)</p>
          <p className="text-sm mt-1 opacity-70">Twitter no longer allows some videos to be embedded directly.</p>
        </div>
        <a 
          href={tweetUrl} 
          target="_blank" 
          rel="noreferrer" 
          className="px-6 py-3 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition-colors pointer-events-auto mt-2"
        >
          Watch on X
        </a>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center group/video">
      <video 
        ref={videoRef}
        poster={media.poster} 
        controls 
        playsInline 
        referrerPolicy="no-referrer"
        className="max-w-full max-h-full w-full h-full object-contain bg-black min-w-0 min-h-0 relative z-10" 
        onClick={togglePlay}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => setHasError(true)}
      >
        <source src={media.url} type="video/mp4" />
      </video>
      {!isPlaying && (
        <button 
          onClick={togglePlay}
          className="absolute inset-0 m-auto w-24 h-24 flex items-center justify-center bg-black/60 hover:bg-black/80 rounded-full text-white transition-colors z-20 backdrop-blur-sm pointer-events-auto"
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
      )}
    </div>
  );
};

export const CustomTweetView: React.FC<CustomTweetViewProps> = ({ id }) => {
  const { data: tweet, isLoading, error } = useTweet(id);
  const { t } = useTranslation();
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  
  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-white/50 text-sm w-full h-full">{t('Loading tweet...')}</div>;
  }
  
  if (error || !tweet) {
    return <div className="flex-1 flex items-center justify-center text-white/50 text-sm w-full h-full">{t('Error loading tweet')}</div>;
  }

  // Format date/time
  const tweetDate = new Date(tweet.created_at);
  const timeString = tweetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateString = tweetDate.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Gather media (photos and videos)
  const mediaItems: Array<{ type: 'photo' | 'video', url: string, poster?: string }> = [];
  if (tweet.photos) {
    mediaItems.push(...tweet.photos.map(p => ({ type: 'photo' as const, url: p.url })));
  }
  if (tweet.video) {
    const variant = tweet.video.variants.find((v: any) => v.content_type === 'video/mp4' || v.type === 'video/mp4');
    if (variant) {
      mediaItems.push({ type: 'video' as const, url: variant.src, poster: tweet.video.poster });
    }
  }
  
  // Format numbers function
  const formatNumber = (num: number) => new Intl.NumberFormat().format(num);

  const handleScroll = () => {
    if (scrollRef.current) {
      const scrollLeft = scrollRef.current.scrollLeft;
      const slideWidth = scrollRef.current.clientWidth;
      const newSlide = Math.round(scrollLeft / slideWidth);
      if (newSlide !== currentSlide) {
        setCurrentSlide(newSlide);
      }
    }
  };

  const scrollLeft = () => scrollRef.current?.scrollBy({ left: -scrollRef.current.clientWidth, behavior: 'smooth' });
  const scrollRight = () => scrollRef.current?.scrollBy({ left: scrollRef.current.clientWidth, behavior: 'smooth' });

  const isGlass = document.querySelector('.theme-glass') !== null;

  return (
    <div className="flex flex-row w-full h-full p-4 gap-6 rounded-[2em] overflow-hidden items-center justify-center font-sans">
      
      {/* Left Column */}
      <div className="flex flex-col w-[35%] h-full justify-center px-6 py-6 relative items-center text-center border-r border-white/10">
        <div className="flex flex-col justify-center gap-6 flex-1 items-center">
          <div className={`relative w-48 h-48 rounded-full flex items-center justify-center self-center flex-shrink-0 ${isGlass ? 'ui-glass-panel' : 'bg-black/20 overflow-hidden'}`}>
            <img 
              src={tweet.user.profile_image_url_https.replace('_normal', '')} 
              alt={tweet.user.name} 
              className="w-full h-full object-cover rounded-full relative z-10" 
              style={isGlass ? { maskImage: 'radial-gradient(circle, black 60%, transparent 100%)', WebkitMaskImage: 'radial-gradient(circle, black 60%, transparent 100%)' } : {}}
            />
          </div>
          
          <div className="flex flex-col text-center mt-2">
            <h2 className="text-[2.5rem] font-bold text-white leading-tight tracking-tight">{tweet.user.name}</h2>
            <span className="text-[1.5rem] text-white/80 font-medium mt-1">@{tweet.user.screen_name}</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 mt-auto pt-8 w-full text-center">
          <div className="text-[1.1rem] font-medium text-white/90 tracking-wide">
            {timeString} | {dateString}
          </div>
          
          <div className="flex justify-center gap-8 text-white/90 mt-2 w-full">
            <div className="flex items-center gap-2">
              <Heart size={24} />
              <span className="font-semibold text-lg">{formatNumber(tweet.favorite_count)}</span>
            </div>
            <div className="flex items-center gap-2">
              <MessageCircle size={24} />
              <span className="font-semibold text-lg">{formatNumber(tweet.conversation_count)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Content Slider */}
      <div className="flex flex-col w-[65%] h-full bg-black rounded-3xl relative overflow-hidden group">
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scroll-smooth" 
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {/* Hide scrollbar for Chrome/Safari using custom style injection */}
          <style>{`
            .scrollbar-hide::-webkit-scrollbar { display: none; }
          `}</style>
          
          {/* Slide 1: Text */}
          <div className="min-w-full w-full h-full snap-center flex items-center justify-center p-16 shrink-0 scrollbar-hide overflow-y-auto">
            <p className="text-white text-[2rem] leading-[1.4] font-medium w-full break-words whitespace-pre-wrap text-left">
              {tweet.text}
            </p>
          </div>

          {/* Slide 2+: Media */}
          {mediaItems.map((media, idx) => (
            <div key={idx} className="relative z-0 min-w-full w-full h-full snap-center flex items-center justify-center shrink-0 min-w-0 min-h-0 overflow-hidden">
              {media.type === 'photo' ? (
                <img src={media.url} alt="Tweet media" className="max-w-full max-h-full w-full h-full object-contain select-none min-w-0 min-h-0 relative z-10" />
              ) : (
                <VideoPlayer media={media} tweetUrl={`https://x.com/${tweet.user.screen_name}/status/${tweet.id_str}`} />
              )}
            </div>
          ))}
          
        </div>
        
        {/* Pagination Dots */}
        {(mediaItems.length > 0) && (
          <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-3 pointer-events-none z-10">
            {[...Array(mediaItems.length + 1)].map((_, i) => (
              <div 
                key={i} 
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  i === currentSlide 
                    ? 'bg-white shadow-[0_0_4px_rgba(0,0,0,0.8)] scale-125' 
                    : 'bg-white/40 shadow-[0_0_4px_rgba(0,0,0,0.8)]'
                }`}
              ></div>
            ))}
          </div>
        )}
        
        {/* Navigation Arrows */}
        {mediaItems.length > 0 && currentSlide > 0 && (
          <button 
            onClick={scrollLeft} 
            className={`absolute left-6 top-1/2 -translate-y-1/2 p-3 text-white rounded-full z-20 flex items-center justify-center transition-colors ${isGlass ? 'ui-glass-panel hover:bg-ui-text hover:text-ui-bg' : 'bg-black/40 hover:bg-white hover:text-black backdrop-blur-sm'}`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
        )}
        {mediaItems.length > 0 && currentSlide < mediaItems.length && (
          <button 
            onClick={scrollRight} 
            className={`absolute right-6 top-1/2 -translate-y-1/2 p-3 text-white rounded-full z-20 flex items-center justify-center transition-colors ${isGlass ? 'ui-glass-panel hover:bg-ui-text hover:text-ui-bg' : 'bg-black/40 hover:bg-white hover:text-black backdrop-blur-sm'}`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        )}
      </div>

    </div>
  );
};
