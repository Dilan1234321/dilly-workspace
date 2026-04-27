require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'DillyScanner'
  s.version        = package['version']
  s.summary        = 'Dilly VisionKit document scanner + Vision OCR bridge.'
  s.description    = 'Dilly VisionKit document scanner + Vision OCR bridge.'
  s.license        = 'MIT'
  s.author         = 'Dilly'
  s.homepage       = 'https://dilly.app'
  s.platforms      = { :ios => '13.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
