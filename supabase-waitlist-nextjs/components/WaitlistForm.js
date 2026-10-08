import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function WaitlistForm() {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', jambCandidate: true });
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ message: '', type: '' });

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: '' }), 4000);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const toggleJambCandidate = (value) => {
    setFormData((prev) => ({ ...prev, jambCandidate: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { name, email, phone, jambCandidate } = formData;

    // Front-end validations
    if (!name.trim() || !email.trim()) {
      showToast('Please fill out all required fields.', 'error');
      setLoading(false);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email)) {
      showToast('Please enter a valid email address.', 'error');
      setLoading(false);
      return;
    }

    try {
      console.log('Inserting into waitlist table with structure:', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        jamb_candidate: jambCandidate
      });

      // Insert record matching exact lowercase fields (Postgres enforces unique email constraint natively)
      const { error: insertError } = await supabase
        .from('waitlist')
        .insert([{ 
          name: name.trim(), 
          email: email.trim().toLowerCase(), 
          phone: phone.trim() || null,
          jamb_candidate: jambCandidate
        }]);

      if (insertError) {
        if (insertError.code === '23505' || (insertError.message && (insertError.message.toLowerCase().includes('unique') || insertError.message.toLowerCase().includes('already exists')))) {
          showToast("You're already on the waitlist! We already have your email — you're all set. 🎉", 'error');
          setLoading(false);
          return;
        }
        console.error('Supabase INSERT Query Error details:', insertError);
        throw insertError;
      }

      // Trigger Edge Function to send welcome email after successful insert.
      // Uses supabase.functions.invoke() — the Supabase JS client handles
      // CORS and auth automatically. Raw fetch() causes CORS preflight failures.
      try {
        console.log('[waitlist] Invoking send-welcome-email via Supabase client...');

        const { data: fnData, error: fnError } = await supabase.functions.invoke(
          'send-welcome-email',
          {
            body: { name: name.trim(), email: email.trim().toLowerCase() }
          }
        );

        if (fnError) {
          console.error('[waitlist] Edge Function error:', fnError.message || fnError);
        } else {
          console.log('[waitlist] Edge Function success:', fnData);
        }
      } catch (fnErr) {
        console.error('[waitlist] Edge Function exception:', fnErr.message);
      }

      showToast("You're on the waitlist 🎉", 'success');
      setFormData({ name: '', email: '', phone: '', jambCandidate: true });

    } catch (err) {
      console.error('Waitlist Submission failed:', err);
      showToast(err.message || 'Something went wrong. Please check console logs.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>Get Early Access</h2>
      <p style={styles.subtext}>Join the waitlist and secure your spot.</p>

      {/* Toast Notification */}
      {toast.message && (
        <div style={{
          ...styles.toast,
          backgroundColor: toast.type === 'success' ? '#10B981' : '#EF4444'
        }}>
          {toast.message}
        </div>
      )}

      <form onSubmit={handleSubmit} style={styles.form} noValidate>
        {/* Name */}
        <div style={styles.group}>
          <label htmlFor="name" style={styles.label}>Full Name</label>
          <input
            type="text"
            id="name"
            name="name"
            placeholder="Enter your full name"
            value={formData.name}
            onChange={handleInputChange}
            required
            style={styles.input}
          />
        </div>

        {/* Email */}
        <div style={styles.group}>
          <label htmlFor="email" style={styles.label}>Email Address</label>
          <input
            type="email"
            id="email"
            name="email"
            placeholder="you@company.com"
            value={formData.email}
            onChange={handleInputChange}
            required
            style={styles.input}
          />
        </div>

        {/* Phone */}
        <div style={styles.group}>
          <label htmlFor="phone" style={styles.label}>
            Phone Number <span style={styles.optional}>(Optional)</span>
          </label>
          <input
            type="tel"
            id="phone"
            name="phone"
            placeholder="e.g. +234 801 234 5678"
            value={formData.phone}
            onChange={handleInputChange}
            style={styles.input}
          />
        </div>

        {/* JAMB Candidate Toggle Switch */}
        <div style={styles.group}>
          <label style={styles.label}>Are you a JAMB candidate?</label>
          <div style={styles.toggleContainer}>
            <div 
              style={{...styles.toggleOption, ...(formData.jambCandidate ? styles.toggleOptionActive : {})}}
              onClick={() => toggleJambCandidate(true)}
            >
              Yes
            </div>
            <div 
              style={{...styles.toggleOption, ...(!formData.jambCandidate ? styles.toggleOptionActive : {})}}
              onClick={() => toggleJambCandidate(false)}
            >
              No
            </div>
          </div>
        </div>

        {/* Submit */}
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Adding you...' : 'Join the Waitlist'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  card: {
    background: 'rgba(21, 17, 82, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(16px)',
    borderRadius: '16px',
    padding: '32px',
    maxWidth: '450px',
    width: '100%',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
    color: '#FFFFFF',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    marginBottom: '8px',
    textAlign: 'center'
  },
  subtext: {
    color: '#A5ADCF',
    fontSize: '15px',
    marginBottom: '24px',
    textAlign: 'center'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#FFFFFF'
  },
  optional: {
    fontWeight: '400',
    opacity: 0.7
  },
  input: {
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#FFFFFF',
    fontSize: '15px',
    outline: 'none',
    transition: 'all 0.2s ease'
  },
  toggleContainer: {
    display: 'flex',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '30px',
    padding: '4px',
    border: '1px solid rgba(255, 255, 255, 0.1)'
  },
  toggleOption: {
    flex: 1,
    padding: '8px 0',
    textAlign: 'center',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    borderRadius: '25px',
    transition: 'all 0.2s ease',
    color: '#A5ADCF'
  },
  toggleOptionActive: {
    background: '#37E915',
    color: '#0F0040'
  },
  button: {
    padding: '14px',
    borderRadius: '50px',
    background: '#37E915',
    color: '#0F0040',
    border: 'none',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginTop: '10px'
  },
  toast: {
    padding: '12px',
    borderRadius: '8px',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: '16px',
    fontWeight: '600',
    animation: 'fadeIn 0.3s ease-in-out'
  }
};
