/**
 * PODBIT — Main Site JavaScript
 *
 * Handles:
 *   - IntersectionObserver for scroll-triggered animations
 *   - Sticky nav styling on scroll
 *   - Mobile nav toggle
 *   - Smooth-scroll for anchor links
 *   - Docs sidebar navigation (tab switching)
 *   - Code block copy buttons
 *   - Pipeline step activation on scroll
 */

(() => {
  

  // ═════════════════════════════════════════════════════════════
  // 1. SCROLL-TRIGGERED ANIMATIONS (IntersectionObserver)
  // ═════════════════════════════════════════════════════════════
  const animElements = document.querySelectorAll('.anim-in');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    animElements.forEach((el) => observer.observe(el));
  } else {
    // Fallback: show everything immediately
    animElements.forEach((el) => el.classList.add('visible'));
  }

  // ═════════════════════════════════════════════════════════════
  // 2. NAV — Scroll styling
  // ═════════════════════════════════════════════════════════════
  const nav = document.getElementById('main-nav');
  let _lastScroll = 0;
  function updateNav() {
    const y = window.scrollY;
    if (y > 50) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
    _lastScroll = y;
  }
  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav();

  // ═════════════════════════════════════════════════════════════
  // 3. NAV — Active link highlighting
  // ═════════════════════════════════════════════════════════════
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');

  function updateActiveNav() {
    const scrollPos = window.scrollY + 100;
    let currentSection = '';
    sections.forEach((section) => {
      if (section.offsetTop <= scrollPos) {
        currentSection = section.id;
      }
    });
    navLinks.forEach((link) => {
      const href = link.getAttribute('href');
      if (href === '#' + currentSection) {
        link.style.color = 'var(--text-primary)';
      } else {
        link.style.color = '';
      }
    });
  }
  window.addEventListener('scroll', updateActiveNav, { passive: true });

  // ═════════════════════════════════════════════════════════════
  // 4. MOBILE NAV TOGGLE
  // ═════════════════════════════════════════════════════════════
  const toggle = document.querySelector('.nav-toggle');
  const navMenu = document.querySelector('.nav-links');
  if (toggle && navMenu) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', !open);
      navMenu.classList.toggle('open');
    });
    // Close on link click
    navMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        toggle.setAttribute('aria-expanded', 'false');
        navMenu.classList.remove('open');
      });
    });
  }

  // ═════════════════════════════════════════════════════════════
  // 5. SMOOTH SCROLL for anchor links
  // ═════════════════════════════════════════════════════════════
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const top = target.getBoundingClientRect().top + window.scrollY - 64;
        window.scrollTo({ top, behavior: 'smooth' });
        // Update URL without jumping
        history.pushState(null, '', link.getAttribute('href'));
      }
    });
  });

  // ═════════════════════════════════════════════════════════════
  // 6. DOCS SIDEBAR — Tab navigation
  // ═════════════════════════════════════════════════════════════
  const docsLinks = document.querySelectorAll('.docs-link');
  const docSections = document.querySelectorAll('.doc-section');

  function switchDoc(docId) {
    docsLinks.forEach((l) => l.classList.toggle('active', l.dataset.doc === docId));
    docSections.forEach((s) => s.classList.toggle('active', s.dataset.doc === docId));
    window.scrollTo(0, 0);
  }

  docsLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchDoc(link.dataset.doc);
      // Scroll docs section into view on mobile
      const docsTop = document.getElementById('docs');
      if (docsTop && window.innerWidth < 768) {
        const top = docsTop.getBoundingClientRect().top + window.scrollY - 64;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // Handle internal doc links (rendered from React <Link> components by build-docs)
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.docs-link-internal');
    if (link) {
      e.preventDefault();
      const docId = link.dataset.doc;
      if (docId) {
        switchDoc(docId);
        history.pushState(null, '', `#doc-${docId}`);
        const docsTop = document.getElementById('docs');
        if (docsTop && window.innerWidth < 768) {
          const top = docsTop.getBoundingClientRect().top + window.scrollY - 64;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      }
    }
  });

  // Handle direct hash links to doc sections (e.g. #doc-mcp)
  function handleDocHash() {
    const hash = window.location.hash;
    if (hash?.startsWith('#doc-')) {
      const docId = hash.replace('#doc-', '');
      switchDoc(docId);
    }
  }
  handleDocHash();
  window.addEventListener('hashchange', handleDocHash);

  // ═════════════════════════════════════════════════════════════
  // 7. CODE BLOCK COPY BUTTONS
  // ═════════════════════════════════════════════════════════════
  document.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const codeBlock = btn.closest('.code-block');
      const code = codeBlock?.querySelector('code');
      if (!code) return;

      const text = code.textContent;
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 2000);
      }).catch(() => {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 2000);
      });
    });
  });

  // ═════════════════════════════════════════════════════════════
  // 8. PIPELINE STEP ACTIVATION ON SCROLL
  // ═════════════════════════════════════════════════════════════
  const pipelineSteps = document.querySelectorAll('.pipeline-step');
  if ('IntersectionObserver' in window && pipelineSteps.length) {
    const stepObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
          } else {
            entry.target.classList.remove('active');
          }
        }
      },
      { threshold: 0.5 }
    );
    pipelineSteps.forEach((step) => stepObserver.observe(step));
  }

  // ═════════════════════════════════════════════════════════════
  // 9. COUNTER ANIMATION for hero stats
  // ═════════════════════════════════════════════════════════════
  const statValues = document.querySelectorAll('.stat-value');
  let statsAnimated = false;
  function animateStats() {
    if (statsAnimated) return;
    statsAnimated = true;
    statValues.forEach((el) => {
      const target = parseInt(el.textContent, 10);
      if (Number.isNaN(target)) return;
      let current = 0;
      const step = Math.ceil(target / 30);
      const interval = setInterval(() => {
        current += step;
        if (current >= target) {
          current = target;
          clearInterval(interval);
        }
        el.textContent = current;
      }, 30);
    });
  }

  // Trigger stats animation when hero stats become visible
  const heroStats = document.querySelector('.hero-stats');
  if (heroStats && 'IntersectionObserver' in window) {
    const statsObs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          animateStats();
          statsObs.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    statsObs.observe(heroStats);
  }

  // ═════════════════════════════════════════════════════════════
  // 10. CONTACT FORM
  // ═════════════════════════════════════════════════════════════
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    const statusEl = document.getElementById('contact-status');
    const submitBtn = contactForm.querySelector('.contact-submit');

    function showFieldError(field, message) {
      field.classList.add('has-error');
      let errEl = field.parentElement.querySelector('.field-error');
      if (!errEl) {
        errEl = document.createElement('div');
        errEl.className = 'field-error';
        field.parentElement.appendChild(errEl);
      }
      errEl.textContent = message;
    }

    function clearFieldErrors() {
      contactForm.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
      contactForm.querySelectorAll('.field-error').forEach(el => el.remove());
    }

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors();
      statusEl.textContent = '';
      statusEl.className = 'contact-status';

      const name = contactForm.querySelector('[name="name"]');
      const email = contactForm.querySelector('[name="email"]');
      const message = contactForm.querySelector('[name="message"]');
      const website = contactForm.querySelector('[name="website"]');

      // Client-side validation
      let valid = true;
      if (!name.value.trim()) {
        showFieldError(name, 'Name is required.');
        valid = false;
      } else if (name.value.length > 200) {
        showFieldError(name, 'Name is too long.');
        valid = false;
      }

      if (!email.value.trim()) {
        showFieldError(email, 'Email is required.');
        valid = false;
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
        showFieldError(email, 'Please enter a valid email.');
        valid = false;
      }

      if (!message.value.trim()) {
        showFieldError(message, 'Message is required.');
        valid = false;
      } else if (message.value.trim().length < 10) {
        showFieldError(message, 'Message must be at least 10 characters.');
        valid = false;
      }

      if (!valid) return;

      // Submit
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      try {
        const res = await fetch('/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.value.trim(),
            email: email.value.trim(),
            message: message.value.trim(),
            website: website.value,
          }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          statusEl.textContent = 'Message sent! Thanks for reaching out.';
          statusEl.className = 'contact-status success';
          contactForm.reset();
        } else {
          statusEl.textContent = data.error || 'Something went wrong. Please try again.';
          statusEl.className = 'contact-status error';
        }
      } catch (_err) {
        statusEl.textContent = 'Failed to send. Please try again later.';
        statusEl.className = 'contact-status error';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Message';
      }
    });
  }
})();
