#Requires -RunAsAdministrator
<#
    Ad Blocking via Windows hosts file
    Run as Admin: Right-click → Run with PowerShell (as Admin)
#>

$ErrorActionPreference = 'SilentlyContinue'

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "    Ad Blocker - Mansoura Cinema" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$marker = "# === AD_BLOCKER_START ==="
$markerEnd = "# === AD_BLOCKER_END ==="

# Check if already installed
$existing = Get-Content $hostsPath -ErrorAction SilentlyContinue | Select-String $marker
if ($existing) {
    Write-Host "[i] Ad Blocker is already installed." -ForegroundColor Green
    $choice = Read-Host "Type 'remove' to uninstall, or press Enter to skip"
    if ($choice -eq 'remove') {
        $content = Get-Content $hostsPath -Raw
        $pattern = "(?s)$marker.*?$markerEnd`n?"
        $content = [regex]::Replace($content, $pattern, "")
        Set-Content $hostsPath $content.TrimEnd() -Encoding ASCII
        Write-Host "[OK] Ad Blocker removed. Flushing DNS..." -ForegroundColor Green
        ipconfig /flushdns | Out-Null
        Write-Host "[OK] Done." -ForegroundColor Green
        exit 0
    }
    exit 0
}

Write-Host "[*] Installing Ad Blocker..." -ForegroundColor Yellow

$adDomains = @"
# === AD_BLOCKER_START ===
# Ad & Tracking domains blocked by Mansoura Cinema Ad Blocker
# Google Ads
0.0.0.0 pagead2.googlesyndication.com
0.0.0.0 googleadservices.com
0.0.0.0 adservice.google.com
0.0.0.0 www.googleadservices.com
0.0.0.0 tpc.googlesyndication.com
0.0.0.0 doubleclick.net
0.0.0.0 www.doubleclick.net
0.0.0.0 ad.doubleclick.net
0.0.0.0 stats.g.doubleclick.net
0.0.0.0 fls.doubleclick.net
0.0.0.0 static.doubleclick.net
0.0.0.0 googleads.g.doubleclick.net
0.0.0.0 partners.googleadservices.com
0.0.0.0 ads.google.com
0.0.0.0 adsense.google.com
# Facebook Ads
0.0.0.0 graph.facebook.com
0.0.0.0 pixel.facebook.com
0.0.0.0 static.ads-twitter.com
0.0.0.0 analytics.twitter.com
0.0.0.0 ads-twitter.com
0.0.0.0 ad.atdmt.com
# Taboola
0.0.0.0 taboola.com
0.0.0.0 www.taboola.com
0.0.0.0 api.taboola.com
0.0.0.0 cdn.taboola.com
0.0.0.0 nr.taboola.com
0.0.0.0 trc.taboola.com
0.0.0.0 vidstat.taboola.com
0.0.0.0 console.taboola.com
# Outbrain
0.0.0.0 outbrain.com
0.0.0.0 www.outbrain.com
0.0.0.0 widgets.outbrain.com
0.0.0.0 log.outbrain.com
0.0.0.0 ampx.outbrain.com
0.0.0.0 odb.outbrain.com
# Criteo
0.0.0.0 criteo.com
0.0.0.0 www.criteo.com
0.0.0.0 cdn.criteo.com
0.0.0.0 ads.criteo.com
0.0.0.0 criteo.net
0.0.0.0 www.criteo.net
0.0.0.0 dis.criteo.com
0.0.0.0 widget.criteo.com
# Pubmatic
0.0.0.0 pubmatic.com
0.0.0.0 www.pubmatic.com
0.0.0.0 ads.pubmatic.com
0.0.0.0 gads.pubmatic.com
0.0.0.0 tag.pubmatic.com
0.0.0.0 hbpub.pubmatic.com
# OpenX
0.0.0.0 openx.net
0.0.0.0 www.openx.net
0.0.0.0 openx.com
0.0.0.0 www.openx.com
0.0.0.0 ousopendata.openx.net
0.0.0.0 psevd.doubleclick.net
0.0.0.0 serve.openx.net
# Rubicon / Magnite
0.0.0.0 rubiconproject.com
0.0.0.0 www.rubiconproject.com
0.0.0.0 ads.rubiconproject.com
0.0.0.0 pixel.rubiconproject.com
0.0.0.0 video.rubiconproject.com
0.0.0.0 fastlane.rubiconproject.com
0.0.0.0 exapi-us-west.rubiconproject.com
# Casale / IndexExchange
0.0.0.0 casalemedia.com
0.0.0.0 www.casalemedia.com
0.0.0.0 p.casalemedia.com
0.0.0.0 indexww.com
0.0.0.0 www.indexww.com
# Sharethrough
0.0.0.0 sharethrough.com
0.0.0.0 www.sharethrough.com
0.0.0.0 direct.sharethrough.com
# Seedtag
0.0.0.0 seedtag.com
0.0.0.0 www.seedtag.com
0.0.0.0 cdn.seedtag.com
# PropellerAds
0.0.0.0 propellerads.com
0.0.0.0 www.propellerads.com
0.0.0.0 ads.propellerads.com
0.0.0.0 partners.propellerads.com
0.0.0.0 go.propellerads.com
0.0.0.0 ad.propellerads.com
0.0.0.0 abhandlers.com
0.0.0.0 abv-bg.com
# Monetag
0.0.0.0 monetag.com
0.0.0.0 www.monetag.com
0.0.0.0 ads.monetag.com
0.0.0.0 cdn.monetag.com
0.0.0.0 tag.monetag.com
0.0.0.0 trk.monetag.com
0.0.0.0 alfa-search.com
# Adsterra
0.0.0.0 adsterra.com
0.0.0.0 www.adsterra.com
0.0.0.0 ads.adsterra.com
0.0.0.0 partners.adsterra.com
0.0.0.0 www.adsterra.net
0.0.0.0 adsterra.net
0.0.0.0 ad.adsterra.com
0.0.0.0 surforama.com
0.0.0.0 adv.adsterra.com
# HilltopAds
0.0.0.0 hilltopads.com
0.0.0.0 www.hilltopads.com
0.0.0.0 cdn.hilltopads.com
0.0.0.0 ads.hilltopads.com
# ExoClick
0.0.0.0 exoclick.com
0.0.0.0 www.exoclick.com
0.0.0.0 ads.exoclick.com
0.0.0.0 a.exoclick.com
0.0.0.0 z.exoclick.com
# JuicyAds
0.0.0.0 juicyads.com
0.0.0.0 www.juicyads.com
0.0.0.0 ad.juicyads.com
# TrafficJunky
0.0.0.0 trafficjunky.com
0.0.0.0 www.trafficjunky.com
0.0.0.0 ads.trafficjunky.com
# PopAds
0.0.0.0 popads.net
0.0.0.0 www.popads.net
0.0.0.0 ads.popads.net
# PopCash
0.0.0.0 popcash.net
0.0.0.0 www.popcash.net
0.0.0.0 banner.popcash.net
# BCVC
0.0.0.0 bcvc.net
0.0.0.0 www.bcvc.net
0.0.0.0 a.bcvc.net
# Venotro
0.0.0.0 venotro.com
0.0.0.0 www.venotro.com
# TrafficStars
0.0.0.0 trafficstars.com
0.0.0.0 www.trafficstars.com
0.0.0.0 ads.trafficstars.com
# AdKeeper
0.0.0.0 adskeeper.com
0.0.0.0 www.adskeeper.com
# MGID
0.0.0.0 mgid.com
0.0.0.0 www.mgid.com
0.0.0.0 cdn.mgid.com
0.0.0.0 c.mgid.com
0.0.0.0 ad.mgid.com
# EvaDav
0.0.0.0 evadav.com
0.0.0.0 www.evadav.com
0.0.0.0 ads.evadav.com
# Galaksion
0.0.0.0 galaksion.com
0.0.0.0 www.galaksion.com
0.0.0.0 cdn.galaksion.com
# AdMaven
0.0.0.0 ad-maven.com
0.0.0.0 www.ad-maven.com
0.0.0.0 ads.ad-maven.com
# BidVertiser
0.0.0.0 bidvertiser.com
0.0.0.0 www.bidvertiser.com
0.0.0.0 ads.bidvertiser.com
# Infolinks
0.0.0.0 infolinks.com
0.0.0.0 www.infolinks.com
0.0.0.0 resources.infolinks.com
# AdColony
0.0.0.0 adcolony.com
0.0.0.0 www.adcolony.com
# Vungle
0.0.0.0 vungle.com
0.0.0.0 www.vungle.com
0.0.0.0 ads.vungle.com
# Unity Ads
0.0.0.0 unity3d.com
0.0.0.0 ads.unity3d.com
0.0.0.0 auction.unityads.unity3d.com
0.0.0.0 config.unityads.unity3d.com
# AppLovin
0.0.0.0 applovin.com
0.0.0.0 www.applovin.com
0.0.0.0 ads.applovin.com
# StartApp
0.0.0.0 startapp.com
0.0.0.0 www.startapp.com
0.0.0.0 ads.startapp.com
# InMobi
0.0.0.0 inmobi.com
0.0.0.0 www.inmobi.com
0.0.0.0 ads.inmobi.com
# AppBrain
0.0.0.0 appbrain.com
0.0.0.0 www.appbrain.com
0.0.0.0 ads.appbrain.com
# Amazon Ads
0.0.0.0 amazon-adsystem.com
0.0.0.0 www.amazon-adsystem.com
0.0.0.0 aax-us-east.amazon-adsystem.com
0.0.0.0 fls-na.amazon-adsystem.com
# Zergnet
0.0.0.0 zergnet.com
0.0.0.0 www.zergnet.com
# Revcontent
0.0.0.0 revcontent.com
0.0.0.0 www.revcontent.com
0.0.0.0 cdn.revcontent.com
# AdRoll
0.0.0.0 adroll.com
0.0.0.0 www.adroll.com
0.0.0.0 ads.adroll.com
# Chitika
0.0.0.0 chitika.com
0.0.0.0 www.chitika.com
# Kontera
0.0.0.0 kontera.com
0.0.0.0 www.kontera.com
# 1xbet ads
0.0.0.0 1xbet.com
0.0.0.0 www.1xbet.com
0.0.0.0 1xbed.com
# Popunder / Redirect domains
0.0.0.0 pop.myway.com
0.0.0.0 bundlestorage.com
0.0.0.0 www.bundlestorage.com
0.0.0.0 catchclickpop.com
0.0.0.0 www.catchclickpop.com
0.0.0.0 rapidglobalryfiles.com
0.0.0.0 www.rapidglobalryfiles.com
0.0.0.0 4refntrated.info
0.0.0.0 www.4refntrated.info
0.0.0.0 codeclickgood.com
0.0.0.0 www.codeclickgood.com
0.0.0.0 bestresulttostart.com
0.0.0.0 www.bestresulttostart.com
0.0.0.0 afabtech.com
0.0.0.0 www.afabtech.com
0.0.0.0 ratester.com
0.0.0.0 www.ratester.com
0.0.0.0 pushsrv.com
0.0.0.0 www.pushsrv.com
0.0.0.0 trking点me
0.0.0.0 www.trking点me
0.0.0.0 getconat.com
0.0.0.0 www.getconat.com
0.0.0.0 submitnet.net
0.0.0.0 www.submitnet.net
0.0.0.0 excentriv.com
0.0.0.0 www.excentriv.com
0.0.0.0 trackpush.com
0.0.0.0 www.trackpush.com
0.0.0.0 stariktok.com
0.0.0.0 www.stariktok.com
0.0.0.0 servesurge.com
0.0.0.0 www.servesurge.com
0.0.0.0 myvpnsite.com
0.0.0.0 www.myvpnsite.com
0.0.0.0 automaticgrowth.com
0.0.0.0 www.automaticgrowth.com
0.0.0.0 scanresa.com
0.0.0.0 www.scanresa.com
0.0.0.0 mfruse.com
0.0.0.0 www.mfruse.com
0.0.0.0 eruthoxup.com
0.0.0.0 www.eruthoxup.com
0.0.0.0 ophoacit.com
0.0.0.0 www.ophoacit.com
0.0.0.0 staubsims.com
0.0.0.0 www.staubsims.com
0.0.0.0 quifeld.com
0.0.0.0 www.quifeld.com
0.0.0.0 ewruovd.com
0.0.0.0 www.ewruovd.com
0.0.0.0 adblockanalytics.com
0.0.0.0 www.adblockanalytics.com
0.0.0.0 adsy.site
0.0.0.0 www.adsy.site
0.0.0.0 sweetchildren.com
0.0.0.0 www.sweetchildren.com
0.0.0.0 ldmushroom.com
0.0.0.0 www.ldmushroom.com
0.0.0.0 setupad.com
0.0.0.0 www.setupad.com
0.0.0.0 analytics.blue
0.0.0.0 www.analytics.blue
0.0.0.0 adsfeed360.com
0.0.0.0 www.adsfeed360.com
0.0.0.0 clikzz.com
0.0.0.0 www.clikzz.com
0.0.0.0 mellowads.com
0.0.0.0 www.mellowads.com
0.0.0.0 monetizerrors.com
0.0.0.0 www.monetizerrors.com
0.0.0.0 adsterra.com
0.0.0.0 www.adsterra.com
0.0.0.0 excluimedia.com
0.0.0.0 www.excluimedia.com
0.0.0.0 okdomain.net
0.0.0.0 www.okdomain.net
0.0.0.0 ringermovs.com
0.0.0.0 www.ringermovs.com
0.0.0.0 sinuatesubden.com
0.0.0.0 www.sinuatesubden.com
0.0.0.0 elw9o.work
0.0.0.0 www.elw9o.work
0.0.0.0 adsco.re
0.0.0.0 www.adsco.re
0.0.0.0 mbdnb.com
0.0.0.0 www.mbdnb.com
0.0.0.0 obmagnent.com
0.0.0.0 www.obmagnent.com
0.0.0.0 menaout.com
0.0.0.0 www.menaout.com
0.0.0.0 charmstroy.com
0.0.0.0 www.charmstroy.com
0.0.0.0 adspyreno.com
0.0.0.0 www.adspyreno.com
0.0.0.0 adqit.com
0.0.0.0 www.adqit.com
0.0.0.0 yesadtraffic.com
0.0.0.0 www.yesadtraffic.com
0.0.0.0 rtbsystem.com
0.0.0.0 www.rtbsystem.com
0.0.0.0 adsinside.com
0.0.0.0 www.adsinside.com
0.0.0.0 adstape.com
0.0.0.0 www.adstape.com
0.0.0.0 lopsoy.com
0.0.0.0 www.lopsoy.com
0.0.0.0 manjusp.com
0.0.0.0 www.manjusp.com
0.0.0.0 ohmha.com
0.0.0.0 www.ohmha.com
0.0.0.0 adhealers.com
0.0.0.0 www.adhealers.com
0.0.0.0 crreed.com
0.0.0.0 www.crreed.com
0.0.0.0 hitopad.com
0.0.0.0 www.hitopad.com
0.0.0.0 obzvil.com
0.0.0.0 www.obzvil.com
0.0.0.0 adsyan.com
0.0.0.0 www.adsyan.com
0.0.0.0 oos4l.com
0.0.0.0 www.oos4l.com
0.0.0.0 adlooks.com
0.0.0.0 www.adlooks.com
0.0.0.0 alxsite.com
0.0.0.0 www.alxsite.com
0.0.0.0 evengreter.com
0.0.0.0 www.evengreter.com
0.0.0.0 adthor.com
0.0.0.0 www.adthor.com
0.0.0.0 adserv8.com
0.0.0.0 www.adserv8.com
0.0.0.0 goesfunny.com
0.0.0.0 www.goesfunny.com
0.0.0.0 pushnami.com
0.0.0.0 www.pushnami.com
0.0.0.0 netcitysrv.com
0.0.0.0 www.netcitysrv.com
0.0.0.0 ilivewhat.com
0.0.0.0 www.ilivewhat.com
0.0.0.0 skylog.xyz
0.0.0.0 www.skylog.xyz
0.0.0.0 dfpuu.info
0.0.0.0 www.dfpuu.info
0.0.0.0 uzivow.com
0.0.0.0 www.uzivow.com
0.0.0.0 ads2bid.com
0.0.0.0 www.ads2bid.com
0.0.0.0 geto.googletagmanager.com
0.0.0.0 www.googletagmanager.com
0.0.0.0 ad.sxp.smartclip.net
0.0.0.0 cdn.onclckmn.com
0.0.0.0 t.onclckmn.com
0.0.0.0 gAlnabk.com
# === AD_BLOCKER_END ===
"@

# Append to hosts file
Add-Content -Path $hostsPath -Value "`n$adDomains" -Encoding ASCII
Write-Host "[OK] Ad domains added to hosts file ($([regex]::Matches($adDomains, '0\.0\.0\.0').Count) domains)" -ForegroundColor Green

# Flush DNS cache
Write-Host "[*] Flushing DNS cache..." -ForegroundColor Yellow
ipconfig /flushdns | Out-Null
Write-Host "[OK] DNS cache flushed" -ForegroundColor Green

# Set DNS to AdGuard (backup layer)
Write-Host "[*] Setting DNS to AdGuard (94.140.14.14)..." -ForegroundColor Yellow
$adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' }
foreach ($adapter in $adapters) {
    try {
        Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses @("94.140.14.14", "94.140.15.15") -ErrorAction Stop
        Write-Host "[OK] DNS set for: $($adapter.Name)" -ForegroundColor Green
    } catch {
        Write-Host "[!] Could not set DNS for $($adapter.Name): $_" -ForegroundColor Red
    }
}

# Flush again after DNS change
ipconfig /flushdns | Out-Null

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "    Ad Blocker Installed Successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Blocked: 200+ ad domains" -ForegroundColor White
Write-Host "  DNS: AdGuard (94.140.14.14)" -ForegroundColor White
Write-Host ""
Write-Host "  To uninstall: Run this script again" -ForegroundColor Gray
Write-Host "  and type 'remove'" -ForegroundColor Gray
Write-Host ""
