import Str from 'expensify-common/lib/str';
import PropTypes from 'prop-types';
import React, {useEffect, useRef, useState} from 'react';
import {View} from 'react-native';
import {withOnyx} from 'react-native-onyx';
import _ from 'underscore';
import ColorSchemeWrapper from '@components/ColorSchemeWrapper';
import CustomStatusBarAndBackground from '@components/CustomStatusBarAndBackground';
import ThemeProvider from '@components/ThemeProvider';
import ThemeStylesProvider from '@components/ThemeStylesProvider';
import useLocalize from '@hooks/useLocalize';
import useResponsiveLayout from '@hooks/useResponsiveLayout';
import useSafeAreaInsets from '@hooks/useSafeAreaInsets';
import useStyleUtils from '@hooks/useStyleUtils';
import useThemeStyles from '@hooks/useThemeStyles';
import * as ActiveClientManager from '@libs/ActiveClientManager';
import * as Localize from '@libs/Localize';
import Log from '@libs/Log';
import Navigation from '@libs/Navigation/Navigation';
import Performance from '@libs/Performance';
import Visibility from '@libs/Visibility';
import * as App from '@userActions/App';
import * as Session from '@userActions/Session';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import ChooseSSOOrMagicCode from './ChooseSSOOrMagicCode';
import EmailDeliveryFailurePage from './EmailDeliveryFailurePage';
import LoginForm from './LoginForm';
import SignInPageLayout from './SignInPageLayout';
import UnlinkLoginForm from './UnlinkLoginForm';
import ValidateCodeForm from './ValidateCodeForm';

const propTypes = {
    /** The details about the account that the user is signing in with */
    account: PropTypes.shape({
        /** Error to display when there is an account error returned */
        errors: PropTypes.objectOf(PropTypes.string),

        /** Whether the account is validated */
        validated: PropTypes.bool,

        /** The primaryLogin associated with the account */
        primaryLogin: PropTypes.string,

        /** Does this account require 2FA? */
        requiresTwoFactorAuth: PropTypes.bool,

        /** Is this account having trouble receiving emails */
        hasEmailDeliveryFailure: PropTypes.bool,

        /** Whether or not a sign on form is loading (being submitted) */
        isLoading: PropTypes.bool,

        /** Form that is being loaded */
        loadingForm: PropTypes.oneOf(_.values(CONST.FORMS)),

        /** Whether or not the user has SAML enabled on their account */
        isSAMLEnabled: PropTypes.bool,

        /** Whether or not SAML is required on the account */
        isSAMLRequired: PropTypes.bool,
    }),

    /** The credentials of the person signing in */
    credentials: PropTypes.shape({
        login: PropTypes.string,
        twoFactorAuthCode: PropTypes.string,
        validateCode: PropTypes.string,
    }),

    /** Active Clients connected to ONYX Database */
    activeClients: PropTypes.arrayOf(PropTypes.string),

    /** The user's preferred locale */
    preferredLocale: PropTypes.string,
};

const defaultProps = {
    account: {},
    credentials: {},
    activeClients: [],
    preferredLocale: '',
};

/**
 * @param {Boolean} hasLogin
 * @param {Boolean} hasValidateCode
 * @param {Object} account
 * @param {Boolean} isPrimaryLogin
 * @param {Boolean} isUsingMagicCode
 * @param {Boolean} hasInitiatedSAMLLogin
 * @param {Boolean} hasEmailDeliveryFailure
 * @returns {Object}
 */
function getRenderOptions({hasLogin, hasValidateCode, account, isPrimaryLogin, isUsingMagicCode, hasInitiatedSAMLLogin, shouldShowAnotherLoginPageOpenedMessage}) {
    const hasAccount = !_.isEmpty(account);
    const isSAMLEnabled = Boolean(account.isSAMLEnabled);
    const isSAMLRequired = Boolean(account.isSAMLRequired);
    const hasEmailDeliveryFailure = Boolean(account.hasEmailDeliveryFailure);

    // True if the user has SAML required and we haven't already initiated SAML for their account
    const shouldInitiateSAMLLogin = hasAccount && hasLogin && isSAMLRequired && !hasInitiatedSAMLLogin && account.isLoading;
    const shouldShowChooseSSOOrMagicCode = hasAccount && hasLogin && isSAMLEnabled && !isSAMLRequired && !isUsingMagicCode;

    // SAML required users may reload the login page after having already entered their login details, in which
    // case we want to clear their sign in data so they don't end up in an infinite loop redirecting back to their
    // SSO provider's login page
    if (hasLogin && isSAMLRequired && !shouldInitiateSAMLLogin && !hasInitiatedSAMLLogin && !account.isLoading) {
        Session.clearSignInData();
    }

    const shouldShowLoginForm = !shouldShowAnotherLoginPageOpenedMessage && !hasLogin && !hasValidateCode;
    const shouldShowEmailDeliveryFailurePage = hasLogin && hasEmailDeliveryFailure && !shouldShowChooseSSOOrMagicCode && !shouldInitiateSAMLLogin;
    const isUnvalidatedSecondaryLogin = hasLogin && !isPrimaryLogin && !account.validated && !hasEmailDeliveryFailure;
    const shouldShowValidateCodeForm =
        hasAccount && (hasLogin || hasValidateCode) && !isUnvalidatedSecondaryLogin && !hasEmailDeliveryFailure && !shouldShowChooseSSOOrMagicCode && !isSAMLRequired;
    const shouldShowWelcomeHeader = shouldShowLoginForm || shouldShowValidateCodeForm || shouldShowChooseSSOOrMagicCode || isUnvalidatedSecondaryLogin;
    const shouldShowWelcomeText = shouldShowLoginForm || shouldShowValidateCodeForm || shouldShowChooseSSOOrMagicCode || shouldShowAnotherLoginPageOpenedMessage;
    return {
        shouldShowLoginForm,
        shouldShowEmailDeliveryFailurePage,
        shouldShowUnlinkLoginForm: isUnvalidatedSecondaryLogin,
        shouldShowValidateCodeForm,
        shouldShowChooseSSOOrMagicCode,
        shouldInitiateSAMLLogin,
        shouldShowWelcomeHeader,
        shouldShowWelcomeText,
    };
}

function SignInPageInner({credentials, account, activeClients, preferredLocale}) {
    const styles = useThemeStyles();
    const StyleUtils = useStyleUtils();
    const {translate, formatPhoneNumber} = useLocalize();
    const {shouldUseNarrowLayout, isInModal} = useResponsiveLayout();
    const safeAreaInsets = useSafeAreaInsets();
    const signInPageLayoutRef = useRef();
    const loginFormRef = useRef();
    /** This state is needed to keep track of if user is using recovery code instead of 2fa code,
     * and we need it here since welcome text(`welcomeText`) also depends on it */
    const [isUsingRecoveryCode, setIsUsingRecoveryCode] = useState(false);

    /** This state is needed to keep track of whether the user has opted to use magic codes
     * instead of signing in via SAML when SAML is enabled and not required */
    const [isUsingMagicCode, setIsUsingMagicCode] = useState(false);

    /** This state is needed to keep track of whether the user has been directed to their SSO provider's login page and
     *  if we need to clear their sign in details so they can enter a login */
    const [hasInitiatedSAMLLogin, setHasInitiatedSAMLLogin] = useState(false);

    const isClientTheLeader = activeClients && ActiveClientManager.isClientTheLeader();
    // We need to show "Another login page is opened" message if the page isn't active and visible
    // eslint-disable-next-line rulesdir/no-negated-variables
    const shouldShowAnotherLoginPageOpenedMessage = Visibility.isVisible() && !isClientTheLeader;

    useEffect(() => Performance.measureTTI(), []);
    useEffect(() => {
        if (preferredLocale) {
            return;
        }
        App.setLocale(Localize.getDevicePreferredLocale());
    }, [preferredLocale]);
    useEffect(() => {
        if (credentials.login) {
            return;
        }

        // If we don't have a login set, reset the user's SAML login preferences
        if (isUsingMagicCode) {
            setIsUsingMagicCode(false);
        }
        if (hasInitiatedSAMLLogin) {
            setHasInitiatedSAMLLogin(false);
        }
    }, [credentials.login, isUsingMagicCode, setIsUsingMagicCode, hasInitiatedSAMLLogin, setHasInitiatedSAMLLogin]);

    const {
        shouldShowLoginForm,
        shouldShowEmailDeliveryFailurePage,
        shouldShowUnlinkLoginForm,
        shouldShowValidateCodeForm,
        shouldShowChooseSSOOrMagicCode,
        shouldInitiateSAMLLogin,
        shouldShowWelcomeHeader,
        shouldShowWelcomeText,
    } = getRenderOptions({
        hasLogin: Boolean(credentials.login),
        hasValidateCode: Boolean(credentials.validateCode),
        account,
        isPrimaryLogin: !account.primaryLogin || account.primaryLogin === credentials.login,
        isUsingMagicCode,
        hasInitiatedSAMLLogin,
        shouldShowAnotherLoginPageOpenedMessage,
    });

    if (shouldInitiateSAMLLogin) {
        setHasInitiatedSAMLLogin(true);
        Navigation.isNavigationReady().then(() => Navigation.navigate(ROUTES.SAML_SIGN_IN));
    }

    let welcomeHeader = '';
    let welcomeText = '';
    const headerText = translate('login.hero.header');

    if (shouldShowAnotherLoginPageOpenedMessage) {
        welcomeHeader = translate('welcomeText.anotherLoginPageIsOpen');
        welcomeText = translate('welcomeText.anotherLoginPageIsOpenExplanation');
    } else if (shouldShowLoginForm) {
        welcomeHeader = shouldUseNarrowLayout ? headerText : translate('welcomeText.getStarted');
        welcomeText = shouldUseNarrowLayout ? translate('welcomeText.getStarted') : '';
    } else if (shouldShowValidateCodeForm) {
        if (account.requiresTwoFactorAuth) {
            // We will only know this after a user signs in successfully, without their 2FA code
            welcomeHeader = shouldUseNarrowLayout ? '' : translate('welcomeText.welcomeBack');
            welcomeText = isUsingRecoveryCode ? translate('validateCodeForm.enterRecoveryCode') : translate('validateCodeForm.enterAuthenticatorCode');
        } else {
            const userLogin = Str.removeSMSDomain(credentials.login || '');

            // replacing spaces with "hard spaces" to prevent breaking the number
            const userLoginToDisplay = Str.isSMSLogin(userLogin) ? formatPhoneNumber(userLogin).replace(/ /g, '\u00A0') : userLogin;
            if (account.validated) {
                welcomeHeader = shouldUseNarrowLayout ? '' : translate('welcomeText.welcomeBack');
                welcomeText = shouldUseNarrowLayout
                    ? `${translate('welcomeText.welcomeBack')} ${translate('welcomeText.welcomeEnterMagicCode', {login: userLoginToDisplay})}`
                    : translate('welcomeText.welcomeEnterMagicCode', {login: userLoginToDisplay});
            } else {
                welcomeHeader = shouldUseNarrowLayout ? '' : translate('welcomeText.welcome');
                welcomeText = shouldUseNarrowLayout
                    ? `${translate('welcomeText.welcome')} ${translate('welcomeText.newFaceEnterMagicCode', {login: userLoginToDisplay})}`
                    : translate('welcomeText.newFaceEnterMagicCode', {login: userLoginToDisplay});
            }
        }
    } else if (shouldShowUnlinkLoginForm || shouldShowEmailDeliveryFailurePage || shouldShowChooseSSOOrMagicCode) {
        welcomeHeader = shouldUseNarrowLayout ? headerText : translate('welcomeText.welcomeBack');

        // Don't show any welcome text if we're showing the user the email delivery failed view
        if (shouldShowEmailDeliveryFailurePage || shouldShowChooseSSOOrMagicCode) {
            welcomeText = '';
        }
    } else if (!shouldInitiateSAMLLogin && !hasInitiatedSAMLLogin) {
        Log.warn('SignInPage in unexpected state!');
    }

    const navigateFocus = () => {
        signInPageLayoutRef.current.scrollPageToTop();
        loginFormRef.current.clearDataAndFocus();
    };

    return (
        // Bottom SafeAreaView is removed so that login screen svg displays correctly on mobile.
        // The SVG should flow under the Home Indicator on iOS.
        <View
            style={[styles.signInPage, StyleUtils.getSafeAreaPadding({...safeAreaInsets, bottom: 0, top: isInModal ? 0 : safeAreaInsets.top}, 1)]}
            testID={SignInPageInner.displayName}
        >
            <SignInPageLayout
                welcomeHeader={welcomeHeader}
                welcomeText={welcomeText}
                shouldShowWelcomeHeader={shouldShowWelcomeHeader || !shouldUseNarrowLayout}
                shouldShowWelcomeText={shouldShowWelcomeText}
                ref={signInPageLayoutRef}
                navigateFocus={navigateFocus}
            >
                {/* LoginForm must use the isVisible prop. This keeps it mounted, but visually hidden
             so that password managers can access the values. Conditionally rendering this component will break this feature. */}
                <LoginForm
                    ref={loginFormRef}
                    isVisible={shouldShowLoginForm}
                    blurOnSubmit={account.validated === false}
                    scrollPageToTop={signInPageLayoutRef.current && signInPageLayoutRef.current.scrollPageToTop}
                />
                {shouldShowValidateCodeForm && (
                    <ValidateCodeForm
                        isVisible={!shouldShowAnotherLoginPageOpenedMessage}
                        isUsingRecoveryCode={isUsingRecoveryCode}
                        setIsUsingRecoveryCode={setIsUsingRecoveryCode}
                    />
                )}
                {!shouldShowAnotherLoginPageOpenedMessage && (
                    <>
                        {shouldShowUnlinkLoginForm && <UnlinkLoginForm />}
                        {shouldShowChooseSSOOrMagicCode && <ChooseSSOOrMagicCode setIsUsingMagicCode={setIsUsingMagicCode} />}
                        {shouldShowEmailDeliveryFailurePage && <EmailDeliveryFailurePage />}
                    </>
                )}
            </SignInPageLayout>
        </View>
    );
}
SignInPageInner.propTypes = propTypes;
SignInPageInner.defaultProps = defaultProps;
SignInPageInner.displayName = 'SignInPage';

function SignInPage(props) {
    return (
        <ThemeProvider theme={CONST.THEME.DARK}>
            <ThemeStylesProvider>
                <ColorSchemeWrapper>
                    <CustomStatusBarAndBackground isNested />
                    <SignInPageInner
                        // eslint-disable-next-line react/jsx-props-no-spreading
                        {...props}
                    />
                </ColorSchemeWrapper>
            </ThemeStylesProvider>
        </ThemeProvider>
    );
}

export default withOnyx({
    account: {key: ONYXKEYS.ACCOUNT},
    credentials: {key: ONYXKEYS.CREDENTIALS},
    /**
  This variable is only added to make sure the component is re-rendered
  whenever the activeClients change, so that we call the
  ActiveClientManager.isClientTheLeader function
  everytime the leader client changes.
  We use that function to prevent repeating code that checks which client is the leader.
  */
    activeClients: {key: ONYXKEYS.ACTIVE_CLIENTS},
    preferredLocale: {
        key: ONYXKEYS.NVP_PREFERRED_LOCALE,
    },
})(SignInPage);
