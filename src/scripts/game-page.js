// 遊戲作品頁：截圖燈箱（<dialog>）與點擊後才載入的 YouTube 影片
function initLightbox() {
  const lightbox = document.getElementById('lightbox');
  const shots = [...document.querySelectorAll('.shot')];
  if (!lightbox || !shots.length || typeof lightbox.showModal !== 'function') return;
  const img = lightbox.querySelector('.lightbox-img');
  const count = lightbox.querySelector('.lightbox-count');
  let index = 0;
  let opener = null;
  const show = (i) => {
    index = (i + shots.length) % shots.length;
    const src = shots[index].querySelector('img');
    img.src = src.dataset.full || src.currentSrc || src.src;
    img.alt = src.alt;
    count.textContent = `${index + 1} / ${shots.length}`;
  };
  shots.forEach((shot) => shot.addEventListener('click', () => {
    opener = shot;
    show(Number(shot.dataset.shot) || 0);
    lightbox.showModal();
    document.documentElement.classList.add('no-scroll');
  }));
  lightbox.querySelector('.lightbox-prev').addEventListener('click', () => show(index - 1));
  lightbox.querySelector('.lightbox-next').addEventListener('click', () => show(index + 1));
  lightbox.querySelector('.lightbox-close').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
  });
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.close(); });
  lightbox.addEventListener('close', () => {
    document.documentElement.classList.remove('no-scroll');
    // 隱藏的截圖無法取得焦點，改回最後一張可見的
    const target = opener && opener.offsetParent ? opener : shots.filter((s) => s.offsetParent).pop();
    target?.focus();
  });
}

function initVideo() {
  document.querySelectorAll('.yt[data-yt]').forEach((box) => {
    box.querySelector('.yt-play')?.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.className = 'yt-frame';
      iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(box.dataset.yt)}?autoplay=1`;
      iframe.title = box.dataset.title || 'YouTube';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      box.appendChild(iframe);
      iframe.focus();
    });
  });
}

initLightbox();
initVideo();
