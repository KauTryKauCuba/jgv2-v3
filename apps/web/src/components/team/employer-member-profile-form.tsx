// The redesign's src/components/EmployerMemberProfileForm.tsx, ported: an
// invited teammate's own "About you" — photo, name, role, position, phone —
// on the welcome step and on their My Profile (the company's registrant
// edits theirs on the company contact form instead). Saves through
// team.saveMyProfile; every string goes through t().
import { CONTACT_ROLES, POSITIONS } from "@jobgiga-app/api/shared/positions";
import type { TeamRole } from "@jobgiga-app/api/shared/team-roles";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PhoneInput } from "@/components/form/phone-input";
import { Dropdown } from "@/components/landing/dropdown";
import { Field } from "@/components/landing/field";
import { CheckIcon, UserIcon } from "@/components/landing/icons";
import { gradientFrameClass, inputClass as formInputClass } from "@/lib/landing/form-styles";
import { orpc, queryClient } from "@/utils/orpc";

const inputClass = formInputClass("teal");
const AVATAR_MAX_BYTES = 3 * 1024 * 1024;
const OTHER_POSITION = "__other__";
type ContactRole = (typeof CONTACT_ROLES)[number];

export function EmployerMemberProfileForm({
  initialName,
  initialAvatarUrl,
  initialPosition,
  initialHiringRole,
  initialPhone,
  email,
  companyName,
  teamRole,
  sidebarSlot,
  mode = "edit",
}: {
  // "welcome" = the first-time step after joining a team (/employer/welcome):
  // saving continues to the dashboard.
  mode?: "edit" | "welcome";
  teamRole: TeamRole;
  initialName: string;
  initialAvatarUrl: string | null;
  initialPosition: string | null;
  initialHiringRole: string | null;
  initialPhone: string | null;
  email: string;
  companyName: string;
  sidebarSlot?: React.ReactNode;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const saveMutation = useMutation(orpc.team.saveMyProfile.mutationOptions());
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  // undefined = unchanged; null = removed; data URL = newly picked.
  const [avatarChange, setAvatarChange] = useState<string | null | undefined>(undefined);
  const listed = !initialPosition || (POSITIONS as readonly string[]).includes(initialPosition);
  const [positionPick, setPositionPick] = useState<string>(listed ? (initialPosition ?? "") : OTHER_POSITION);
  const [positionOther, setPositionOther] = useState(listed ? "" : (initialPosition ?? ""));
  const [hiringRole, setHiringRole] = useState<ContactRole | "">(
    (CONTACT_ROLES as readonly string[]).includes(initialHiringRole ?? "") ? (initialHiringRole as ContactRole) : "",
  );
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const position = positionPick === OTHER_POSITION ? positionOther.trim() : positionPick;
  const welcome = mode === "welcome";

  function handleAvatarFile(files: FileList | null) {
    const picked = files?.[0];
    if (!picked) return;
    if (!/^image\/(png|jpe?g)$/.test(picked.type)) {
      setError(t("teamProfile.errors.photoType"));
      return;
    }
    if (picked.size > AVATAR_MAX_BYTES) {
      setError(t("teamProfile.errors.photoSize"));
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setAvatarUrl(dataUrl);
      setAvatarChange(dataUrl);
      setSaved(false);
    };
    reader.readAsDataURL(picked);
  }

  async function save() {
    if (!name.trim()) {
      setError(t("teamProfile.errors.name"));
      return;
    }
    if (!hiringRole) {
      setError(t("teamProfile.errors.role"));
      return;
    }
    if (!position) {
      setError(t("teamProfile.errors.position"));
      return;
    }
    if (!phone.trim()) {
      setError(t("teamProfile.errors.phone"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveMutation.mutateAsync({ name: name.trim(), hiringRole, position, phone: phone.trim(), avatarUrl: avatarChange });
      // The navbar's name/photo, the welcome check and the team list all read this.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orpc.team.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.auth.me.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.onboarding.key() }),
      ]);
      if (welcome) {
        // Keep the button in its busy state through the navigation.
        navigate({ to: teamRole === "panel" ? "/employer/interviews" : "/employer/dashboard" });
        return;
      }
      setAvatarChange(undefined);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("teamProfile.errors.save"));
    } finally {
      setSaving(false);
    }
  }

  // Same "required fields" checklist as the registrant's My Profile.
  const requiredFieldChecklist = [
    { label: t("employerOnboarding.fullName"), done: name.trim().length > 0, fieldId: "memberName" },
    { label: t("employerOnboarding.yourRole"), done: !!hiringRole, fieldId: "memberRole" },
    {
      label: t("employerOnboarding.position"),
      done: !!position,
      fieldId: positionPick === OTHER_POSITION ? "memberPositionOther" : "memberPosition",
    },
    { label: t("employerOnboarding.phoneNumber"), done: phone.trim().length > 0, fieldId: "memberPhone" },
  ];
  const requiredChecklistComplete = requiredFieldChecklist.every((item) => item.done);

  function goToField(fieldId: string) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }

  const card = (
    <div className={`animate-fade-in-up ${gradientFrameClass("teal")} min-w-0 ${welcome ? "xl:flex-[2]" : "lg:sticky lg:top-[85px] lg:flex-1"}`}>
      <div className="rounded-[19px] bg-white p-[16px] text-left sm:p-[22px]">
        <h1 className="text-xl font-semibold text-[#141B2E]">{t("employerOnboarding.aboutYou")}</h1>
        <p className="mt-[6px] text-sm leading-[20px] text-[#4B5468]">
          {welcome
            ? t("teamProfile.welcomeIntro", { company: companyName, role: t(`team.rolesWithArticle.${teamRole}`) })
            : t("teamProfile.editIntro", { company: companyName })}
        </p>

        <div className="mt-[16px] flex flex-col gap-[12px]">
          <div className="flex items-center gap-[14px]">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                handleAvatarFile(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              aria-label={avatarUrl ? t("employerOnboarding.changeProfilePhoto") : t("employerOnboarding.uploadProfilePhoto")}
              className="flex h-[64px] w-[64px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/[0.1] bg-[#F1F4F8] text-[#9AA3B2] hover:border-brand-teal-dark"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              ) : (
                <UserIcon className="h-[26px] w-[26px]" />
              )}
            </button>
            <div className="flex flex-col gap-[4px]">
              <div className="flex items-center gap-[10px]">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="rounded-full bg-[#F1F4F8] px-[12px] py-[6px] text-sm text-[#141B2E] hover:bg-black/[0.08]"
                >
                  {avatarUrl ? t("employerOnboarding.changePhoto") : t("employerOnboarding.uploadPhoto")}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarUrl(null);
                      setAvatarChange(null);
                      setSaved(false);
                    }}
                    className="text-sm text-[#9AA3B2] hover:text-[#141B2E]"
                  >
                    {t("employerOnboarding.remove")}
                  </button>
                )}
              </div>
              <p className="text-xs text-[#9AA3B2]">{t("employerOnboarding.photoHint")}</p>
            </div>
          </div>

          <Field label={t("employerOnboarding.fullName")} htmlFor="memberName" required>
            <input
              id="memberName"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              className={inputClass}
            />
          </Field>

          {/* Same fields, order and options as the registrant's About you. */}
          <Field required label={t("employerOnboarding.yourRole")} htmlFor="memberRole">
            <Dropdown
              id="memberRole"
              label={t("employerOnboarding.yourRole")}
              value={hiringRole}
              options={[
                { value: "" as const, label: t("employerOnboarding.selectYourRole") },
                ...CONTACT_ROLES.map((r) => ({ value: r, label: t(`employerOnboarding.contactRoles.${r}`) })),
              ]}
              onChange={(value) => {
                setHiringRole(value as ContactRole | "");
                setSaved(false);
              }}
            />
          </Field>

          <Field required label={t("employerOnboarding.position")} htmlFor="memberPosition">
            <Dropdown
              id="memberPosition"
              label={t("employerOnboarding.position")}
              value={positionPick}
              searchable
              searchPlaceholder={t("employerOnboarding.searchPositions")}
              options={[
                { value: "", label: t("employerOnboarding.selectYourPosition") },
                ...POSITIONS.map((p) => ({ value: p as string, label: p })),
                { value: OTHER_POSITION, label: t("employerOnboarding.other") },
              ]}
              onChange={(value) => {
                setPositionPick(value);
                setSaved(false);
              }}
            />
          </Field>
          {positionPick === OTHER_POSITION && (
            <Field required label={t("employerOnboarding.yourPosition")} htmlFor="memberPositionOther">
              <input
                id="memberPositionOther"
                type="text"
                value={positionOther}
                onChange={(e) => {
                  setPositionOther(e.target.value);
                  setSaved(false);
                }}
                placeholder={t("employerOnboarding.eGSeniorGraphicDesigner")}
                className={inputClass}
              />
            </Field>
          )}

          <PhoneInput
            required
            id="memberPhone"
            label={t("employerOnboarding.phoneNumber")}
            accent="teal"
            value={phone}
            onChange={(value) => {
              setPhone(value);
              setSaved(false);
              setError(null);
            }}
          />

          <Field label={t("employerOnboarding.emailAddress")} htmlFor="memberEmail">
            <input
              id="memberEmail"
              type="email"
              value={email}
              readOnly
              disabled
              className={`${inputClass} cursor-not-allowed bg-[#F8FAFB] text-[#9AA3B2]`}
            />
          </Field>

          {error && <p className="text-xs text-red-500">{error}</p>}
          {saved && !error && <p className="text-xs text-[#2F7D4F]">{t("employerOnboarding.saved")}</p>}

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex h-[44px] items-center justify-center rounded-full bg-brand-teal-dark text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? t("employerOnboarding.saving") : welcome ? t("teamProfile.continue") : t("employerOnboarding.saveChanges")}
          </button>
        </div>
      </div>
    </div>
  );

  // Same "required fields" checklist card as the registrant's My Profile.
  const checklist = (
    <div
      className={
        requiredChecklistComplete
          ? gradientFrameClass("teal")
          : "rounded-[20px] bg-gradient-to-br from-[#A66A61] via-white to-[#A66A61] p-px shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_-24px_rgba(20,27,46,0.2)]"
      }
    >
      <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
        <p className="text-left text-lg font-semibold text-[#141B2E]">
          {requiredChecklistComplete ? t("teamProfile.checklistDone") : t("teamProfile.checklistTodo")}
        </p>
        <ul className="mt-[16px] flex flex-col gap-[4px]">
          {requiredFieldChecklist.map(({ label, done, fieldId }) => (
            <li key={fieldId}>
              <button
                type="button"
                disabled={done}
                onClick={() => goToField(fieldId)}
                className={`flex w-full items-center gap-[8px] text-left text-sm ${
                  done ? "cursor-default text-[#1F7A3F]" : "text-[#A66A61] hover:underline"
                }`}
              >
                <span
                  className={`flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full border ${
                    done ? "border-[#1F7A3F] bg-[#1F7A3F]" : "border-[#C99089]"
                  }`}
                >
                  {done && <CheckIcon className="h-[8px] w-[8px] text-white" />}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  // The welcome step: About you with the checklist beside it (the page adds
  // the "Your invite" card on the left) — siblings in the page's flex row.
  if (welcome) {
    return (
      <>
        {card}
        <div className="min-w-0 xl:sticky xl:top-[22px] xl:flex-[1]">{checklist}</div>
      </>
    );
  }

  // Same three-column layout as the registrant's My Profile.
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-[20px] lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-col gap-[20px] lg:flex-1 lg:flex-row lg:items-start">
        {card}
        {sidebarSlot && <div className="min-w-0 lg:flex-1">{sidebarSlot}</div>}
      </div>
      <div className="flex flex-col gap-[16px] lg:sticky lg:top-[85px] lg:w-[300px] lg:shrink-0">{checklist}</div>
    </div>
  );
}
