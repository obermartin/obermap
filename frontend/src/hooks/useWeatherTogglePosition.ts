import { useEffect } from 'react';

export const useWeatherTogglePosition = (weatherToggleRef: React.RefObject<HTMLDivElement | null>) => {
  useEffect(() => {
    let animationFrameId: number;

    const updatePosition = () => {
      const toggle = weatherToggleRef.current;
      if (!toggle) {
        animationFrameId = requestAnimationFrame(updatePosition);
        return;
      }
      
      const toolbar = document.getElementById('global-toolbar-container');
      const dateControl = document.getElementById('global-date-control-container');
      
      if (toolbar && dateControl) {
        const toolbarRect = toolbar.getBoundingClientRect();
        const dateRect = dateControl.getBoundingClientRect();
        
        toggle.style.left = `${toolbarRect.right}px`;
        toggle.style.right = `${window.innerWidth - dateRect.left}px`;
      }
      
      animationFrameId = requestAnimationFrame(updatePosition);
    };
    
    updatePosition();
    
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [weatherToggleRef]);
};
