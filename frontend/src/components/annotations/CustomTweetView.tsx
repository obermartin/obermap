import React, { useState, useRef } from 'react';
import { useTweet } from 'react-tweet';
import { Heart, MessageCircle } from 'lucide-react';
import { useTranslation } from '../../contexts/I18nContext';

interface CustomTweetViewProps {
  id: string;
}

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
            <div key={idx} className="min-w-full h-full snap-center flex items-center justify-center shrink-0">
              {media.type === 'photo' ? (
                <img src={media.url} alt="Tweet media" className="max-w-full max-h-full object-contain select-none" />
              ) : (
                <video src={media.url} poster={media.poster} controls className="max-w-full max-h-full object-contain bg-black" />
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
